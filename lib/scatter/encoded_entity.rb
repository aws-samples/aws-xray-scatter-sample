require 'cgi'

module Scatter
    # Represents X-Ray filter expression service keyword.
    #
    # http://docs.aws.amazon.com/xray/latest/devguide/xray-console-filters.html#console-filters-complex
    class Service
        include Comparable

        attr_reader :name, :type

        def initialize(name:, type: nil)
            @name = name
            @type = type
        end

        # Returns X-Ray filter expression ID for the service.
        def to_id
            name = %["#{@name}"]
            type = @type ? %["#{@type}"] : %[null]

            %[id(name: #{name}, type: #{type})]
        end

        def <=>(other)
            case
            when self.type == 'client'
                -1
            when other.type == 'client'
                1
            when self.name != other.name
                self.name <=> other.name
            when self.type && !other.type
                1
            when !self.type && other.type
                -1
            else
                self.type <=> other.type
            end
        end

        def to_h
            if @type
                {
                    'name' => @name,
                    'type' => @type
                }
            else
                {
                    'name' => @name,
                }
            end
        end
    end

    # Represents X-Ray filter expression service or edge keyword.
    #
    # http://docs.aws.amazon.com/xray/latest/devguide/xray-console-filters.html#console-filters-complex
    class EncodedEntity
        include Comparable

        attr_accessor :left, :right

        def self.from_raw(input)
            entity = self.new
            objects = JSON.parse CGI.unescapeHTML(input), :symbolize_names => true

            case objects
            when Hash
                entity.left = Service.new **objects
            when Array
                entity.left, entity.right = objects.collect { |i| Service.new **i }
            else
                logger.error %[invlid entity: #{input}]
                halt 400, "invlid entity: #{input}"
            end

            entity
        end

        def initialize(left: nil, right: nil)
            @left = Service.new :name => left.name, :type => left.type if left
            @right = Service.new :name => right.name, :type => right.type if right
        end

        def edge?
            !!left && !!right
        end

        def service?
            !edge?
        end

        # Returns X-Ray filter expression complex keyword for the service for the edge.
        def filter_expression
            if edge?
                %[edge(#{left.to_id}, #{right.to_id})]
            else
                %[service(#{left.to_id})]
            end
        end

        def <=>(other)
            case
            when self.left != other.left
                self.left <=> other.left
            when !self.right
                -1
            when !other.right
                1
            else
                self.right <=> other.right
            end
        end

        def to_h
            if @right
                [
                    @left.to_h,
                    @right.to_h
                ]
            else
                @left.to_h
            end
        end
    end
end
