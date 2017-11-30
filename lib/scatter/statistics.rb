module Scatter
    # Model for statistics entry returned by /scatter
    class Statistics
        def initialize(timestamp:, entries:, duration:, index:, ok_count:, error_count:, throttle_count:, fault_count:)
            @timestamp = timestamp
            @entries = entries
            @duration = duration.to_f
            @index = index
            @ok_count = ok_count
            @error_count = error_count
            @throttle_count = throttle_count
            @fault_count = fault_count
        end

        def to_h
            {
                :timestamp    => @timestamp,
                :histogram    => @entries,
                :statuses     => [
                    {
                        :status       => 'ok',
                        :request_rate => (@ok_count / @duration).round(5),
                    },
                    {
                        :status       => 'error',
                        :request_rate => (@error_count / @duration).round(5),
                    },
                    {
                        :status       => 'throttle',
                        :request_rate => (@throttle_count / @duration).round(5),
                    },
                    {
                        :status       => 'fault',
                        :request_rate => (@fault_count / @duration).round(5),
                    }
                ],
                :index => @index
            }
        end
    end
end
