module Scatter
    module Parallel
        Task = Struct.new :element, :index, :block, :outbox, :stop
        Result = Struct.new :value, :exception

        @@global_workers = nil
        @@global_inbox = Queue.new

        # == Usage
        #
        #   require 'scatter/parallel'
        #   require 'open-uri'
        #
        #   include Scatter::Parallel
        #   bodies = parallel(urls, :threads => 32) do |url, index|
        #       puts %[#{index} : reading url "#{url}"...]
        #       open(url).read
        #   end
        #
        def parallel(enumerable, **options, &block)
            Parallel.parallel enumerable, **options, &block
        end

        def self.parallel(enumerable, threads: nil, expand_backtrace: true, global: nil, &block)
            raise ArgumentError, %[block is required] unless block

            global = global? if global == nil
            if global && threads
                raise ArgumentError, %[threads is not supported option when global is enabled]
            end
            assert_global! if global

            inbox = @@global_inbox
            size = nil

            unless global
                size = [threads || 16, enumerable.size].min
                inbox = Queue.new
                initialize_workers :size => size, :inbox => inbox
            end

            outbox = Queue.new
            enumerable.each_with_index.collect do |element, index|
                task = Task.new
                task.element = element
                task.index = index
                task.block = block
                task.outbox = outbox

                inbox.push task
            end

            results = []
            while results.size < enumerable.size
                results << outbox.pop
            end

            unless global
                stop_workers :size => size, :inbox => inbox
            end

            if first_failed_result = results.detect(&:exception)
                exception = first_failed_result.exception
                exception.set_backtrace(exception.backtrace + extended_backtrace(expand_backtrace))

                raise exception
            end
            results.collect(&:value)
        end

        def self.enable_global(size: 20)
            if global?
                raise %[global worker pool has already been initialized]
            end

            @@global_workers ||= begin
                initialize_workers :size => size, :inbox => @@global_inbox
            end
        end

        def self.disable_global
            assert_global!

            stop_workers :size => @@global_workers.size, :inbox => @@global_inbox
            @@global_workers.collect &:kill
            @@global_workers = nil
            @@global_inbox.clear
        end

        def self.global?
            @@global_workers != nil
        end

        private
        def self.initialize_workers(size:, inbox:)
            size.times.collect do
                Thread.new do
                    loop do
                        result = Result.new

                        begin
                            task = inbox.pop

                            if task.stop
                                break
                            end

                            result.value = task.block.call task.element, task.index
                        rescue Exception => e
                            result.exception = e
                        end

                        task.outbox.push result
                    end
                end
            end
        end

        private
        def self.stop_workers(size:, inbox:)
            size.times do
                task = Task.new
                task.stop = true
                inbox.push task
            end

            sleep 0.05 until inbox.num_waiting == 0
        end

        private
        def self.assert_global!
            unless global?
                raise %[global worker pool has not been initialized]
            end
        end

        private
        def self.extended_backtrace(expand)
            if expand
                Thread.current
                      .backtrace_locations
                      .drop_while { |i| i.label != __method__.to_s }
                      .drop(2)
                      .collect(&:to_s)
            else
                []
            end
        end
    end
end
