module Scatter
    class Cache
        class Entry
            attr_reader :value, :ttl

            def initialize(value, ttl:)
                @value = value
                @ttl = Time.now + ttl
            end

            def expired?
                Time.now > @ttl
            end
        end

        attr_reader :ttl

        def initialize(ttl:)
            @mutex = Mutex.new
            @c = {}
            @ttl = ttl
        end

        def fetch(key)
            @mutex.synchronize do
                @c.reject! { |k, v| v.expired? }
            end

            if v = @mutex.synchronize { @c[key] }
                return v.value
            end

            v = yield
            @mutex.synchronize do
                @c[key] = Entry.new v, :ttl => ttl
            end
            v
        end
    end
end
