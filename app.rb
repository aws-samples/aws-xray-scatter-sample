require 'sinatra/base'
require 'json'
require 'logger'
require 'aws-sdk-xray'
require 'scatter/encoded_entity'
require 'scatter/statistics'
require 'scatter/parallel'
require 'scatter/cache'

# retry on socket errors
Aws::XRay::Client.remove_plugin Aws::Plugins::HelpfulSocketErrors
Aws.config.update :retry_limit => 6

module Scatter
    class App < Sinatra::Base
        enable :logging
        set :public_folder, File.dirname(__FILE__) + '/static'
        set :template_folder, File.dirname(__FILE__) + '/templates'

        @@timeline_link = %[https://console.aws.amazon.com/xray/home?region=%s#/traces/%s]
        @@grace_period = 60
        @@region = "us-east-1"
        @@xray_client = {}
        @@mutex = Mutex.new
        @@cache = Cache.new :ttl => 7 * 24 * 3600
        @@maximum_time_range = 6 * 24 * 3600

        before do
            content_type 'application/json'
        end

        get '/' do
            logger.info settings.template_folder

            content_type :html, 'charset' => 'utf-8'
            send_file File.join(settings.template_folder, 'scatter.html')
        end

        # Returns the entities (services and edges) that have been active within a specified time 
        # range as a JSON document containing a sorted array of EncodedEntity entries.
        get '/entities' do
            region = fetch 'region', @@region
            start_time = Time.at fetch('startTime').to_i
            end_time = Time.at fetch('endTime').to_i

            services = Aws::XRay::Client.new(:region => region)
                                        .get_service_graph(:start_time => start_time, :end_time => end_time)
                                        .services

            entities = services.flat_map do |service|
                service_entity = EncodedEntity.new :left => service

                edge_entities = service.edges.collect do |edge|
                    EncodedEntity.new :left => service, :right => services.find { |i| i.reference_id == edge.reference_id }
                end

                if service.type == "client"
                    edge_entities
                else
                    [service_entity] + edge_entities
                end
            end

            json :entities => entities.sort.collect(&:to_h)
        end

        # Returns an array of Statistics entries for a specified time range as a JSON document. 
        # Each Statistics entry represents a specified duration.
        get '/scatter' do
            region = fetch 'region', @@region
            entity = EncodedEntity.from_raw fetch('entity')
            start_time = Time.at fetch('startTime').to_i
            end_time = Time.at fetch('endTime').to_i
            duration = fetch('duration').to_i

            h = statistics :region     => region, 
                           :entity     => entity, 
                           :start_time => start_time, 
                           :end_time   => end_time,
                           :duration   => duration

            json :statistics => h.collect(&:to_h)
        end

        # Returns an array of summaries for traces within a specified time range as a JSON 
        # document.
        #
        # The filter expression for **GetTraceSummaries** is generated based on
        # **entity** and **type** parameters.
        #
        # For services:
        #
        #   service(id) { criteria }
        #
        # For edges:
        #
        #   edge(id, id) { criteria }
        #
        # Criteria for "status" type:
        #
        #   !ok
        #
        # Criteria for "responsetime" type:
        #
        #   responsetime <operator> value [&& responsetime <operator> value]
        #
        get '/traces/:type' do
            type = fetch 'type'
            region = fetch 'region', @@region
            entity = EncodedEntity.from_raw fetch('entity')
            start_time = Time.at fetch('startTime').to_i
            end_time = Time.at fetch('endTime').to_i
            response_time_min = fetch 'responseTimeMin', nil
            response_time_max = fetch 'responseTimeMax', nil

            if end_time - start_time > @@maximum_time_range
                start_time = end_time - @@maximum_time_range
            end

            filter_expression = case type
            when /^status$/i
                %[!ok]
            when /^responsetime$/i
                case
                when response_time_min && response_time_max
                    %[responsetime >= #{response_time_min} && responsetime <= #{response_time_max}]
                when response_time_min
                    %[responsetime >= #{response_time_min}]
                when response_time_max
                    %[responsetime <= #{response_time_max}]
                else
                    %[]
                end
            else
                halt 400, "invalid type: #{type}"
            end
            filter_expression = %[#{entity.filter_expression} { #{filter_expression} }]
            logger.info %[filter expression: #{filter_expression}]

            summaries = Aws::XRay::Client.new(:region => region)
                                         .get_trace_summaries(:start_time => start_time, :end_time => end_time, :filter_expression => filter_expression)
                                         .lazy
                                         .flat_map(&:trace_summaries)
                                         .first(100)
                                         .to_a

            traces = summaries.collect do |i|
                annotations = i.annotations.collect do |k, v|
                    values = v.collect do |i|
                        i.annotation_value.boolean_value || i.annotation_value.number_value || i.annotation_value.string_value
                    end

                    [k, values]
                end.to_h

                {
                    :trace_id      => i.id,
                    :timestamp     => Time.at(i.id.split("-")[1].to_i(16)).iso8601,
                    :http_url      => i.http&.http_url,
                    :http_status   => i.http&.http_status,
                    :response_time => i.response_time,
                    :users         => i.users.collect(&:user_name),
                    :annotations   => annotations,
                    :timeline_link => format(@@timeline_link, region, i.id)
                }
            end

            json :traces => traces
        end

        # Returns an array of Statistics entries for a specified time range using. Each Statistics 
        # entry represents a specified duration.
        private
        def statistics(entity:, region:, start_time:, end_time:, duration:)
            time_range = (start_time.to_i)..(end_time.to_i)
            slices = time_range.step(duration).each_cons(2)
            xray = Aws::XRay::Client.new(:region => region)

            logger.info %[fetching #{slices.count} histograms from #{Time.at(time_range.begin).strftime("%D %T %Z")} to #{Time.at(time_range.end).strftime("%D %T %Z")} @ #{region}]

            Parallel.parallel slices, :threads => 6 do |(t0, t1), index|
                service_graph = @@cache.fetch t0..t1 do
                    logger.info %[cache miss for histogram: #{index + 1} / #{slices.count}]

                    xray.get_service_graph(:start_time => t0, :end_time => t1)
                end

                e = service_graph.services
                                 .find { |i| i.name == entity.left.name && i.type == entity.left.type }

                if entity.edge?
                    e = e&.edges&.find do |edge|
                        service_graph.services.find do |service|
                            service.reference_id == edge.reference_id && service.name == entity.right.name && service.type == entity.right.type
                        end
                    end
                end

                histogram = e&.response_time_histogram
                             &.to_a
                histogram ||= []

                ok_count = e&.summary_statistics&.ok_count || 0
                error_count = e&.summary_statistics&.error_statistics&.other_count || 0
                throttle_count = e&.summary_statistics&.error_statistics&.throttle_count || 0
                fault_count = e&.summary_statistics&.fault_statistics&.total_count || 0
    
                Statistics.new :timestamp      => t1, 
                               :entries        => histogram&.collect(&:to_h)&.reverse, 
                               :duration       => t1 - t0, 
                               :ok_count       => ok_count, 
                               :error_count    => error_count, 
                               :throttle_count => throttle_count,
                               :fault_count    => fault_count,
                               :index          => {
                                   :start_time => e&.start_time&.to_i,
                                   :end_time   => e&.end_time&.to_i
                               }
            end
        end

        private
        def json(document)
            document.to_json
        end

        private
        def logger
            env['rack.logger']
        end

        # Returns a cookie or URL parameter for the specified key. If a default value is not
        # specified and key is not found the request is halted with HTTP status 400.
        private
        def fetch(key, default=:missing)
            value = request.cookies[key] || params[key] || default

            if value == :missing
                logger.error %[missing URL parameter: #{e.key}]
                halt 400, "missing URL parameter: #{key}"
            end

            value
        end
    end
end
