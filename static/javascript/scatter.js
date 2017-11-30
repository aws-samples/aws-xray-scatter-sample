"use strict";

const MINUTE = 60000;
const POLL_INTERVAL = 15000;

const scatter = {};

scatter.startTime = null;
scatter.view = null;
scatter.polledAt = null;
scatter.refreshedAt = null;
scatter.error = null;
scatter.statistics = {};
scatter.append = false;
scatter.timeSlots = 180;
scatter.duration = 60000;

// Initializing the vega view without data, or clearing it, doesn't seem to work so we'll 
// rebuild the whole view when the view changes.
scatter.rebuild = function() {
    scatter.timeSlots = (settings.timeSpan == "threeHours") ? 180 : 168;
    scatter.duration = (settings.timeSpan == "threeHours") ? 60000 : 3600000;
    settings.set("duration", scatter.duration / 1000);

    const endTime = scatter.safeEndTime();
    const startTime = scatter.cutOffTime(endTime);

    scatter.clear();
    scatter.fetch("/scatter", settings.entity, startTime, endTime, {}, function(data) {
        const statistics = scatter.mergeStatistics(data.statistics, endTime);
        scatter.build(statistics);
    });
};

// Start incremental update poller during initialization.
scatter.init = function() {
    setInterval(function() {
        const endTime = scatter.safeEndTime();
        const cutOffTime = scatter.cutOffTime(endTime);
        let startTime = scatter.startTime;

        scatter.polledAt = new Date();

        if (startTime && startTime < cutOffTime) {
            startTime = cutOffTime;
        }

        if (settings.entity && startTime && endTime.getTime() - startTime.getTime() >= scatter.duration) {
            console.log("fetch", startTime, endTime);

            scatter.appendStatistics(startTime, endTime, cutOffTime, scatter.append);
        }
    }, POLL_INTERVAL);

    scatter.polledAt = new Date();
};

scatter.clear = function() {
    scatter.append = false;

    scatter.startTime = null;
    scatter.refreshedAt = null;
    scatter.statistics = {};

    traces.clear();
    scatter.hideChart();
};

// Initialize the Vega Lite view and the event listener for selections lazily with initial set of 
// statistics to workaround limitations of Vega Lite. 
scatter.build = function(statistics) {
    const width = document.documentElement.clientWidth - 175;
    let scatterHeight = (document.documentElement.clientHeight - 500 > 750) ? 750 : document.documentElement.clientHeight - 500;
    const statusesHeight = 100;

    if (scatterHeight < statusesHeight * 3) {
        scatterHeight = statusesHeight * 3;
    }

    var spec = {
        "$schema": "https://vega.github.io/schema/vega-lite/v2.json",
        "config": {
            "range": {
                "heatmap": [
                    "orange",
                    "red",
                    "black",
                ],
                "ramp": [
                    "orange",
                    "red",
                    "black",
                ]
            },
            "legend": {
                "gradientWidth": 50,
            },
            "invalidValues": "filter",
        },
        "view": {
            "stroke": "transparent"
        },
        "vconcat": [{
                "data": {
                    "name": "histogram",
                    "values": statistics.histogram,
                },
                "width": width,
                "height": scatterHeight,
                "mark": {
                    "type": "rect",
                    // "type": "circle",
                    // "size": 100,
                },
                "encoding": {
                    "x": {
                        "field": "time",
                        "type": "temporal",
                        "bin": { "maxbins": scatter.timeSlots }, // rect only
                        "axis": {
                            "format": (settings.timeSpan == "threeHours") ? "%H:%M" : "%m/%d %H:%M",
                            "title": "time",
                            "tickCount": 24
                        },
                    },
                    "y": {
                        "field": "value",
                        "type": "quantitative",
                        "bin": { "maxbins": 180 },
                        "axis": {
                            "title": "response time",
                            "orient": "right",
                            "tickCount": 24,
                        },
                    },
                    "color": {
                        "aggregate": "count",
                        "type": "quantitative",
                        "legend": {
                            "title": "Count",
                        },
                    }
                },
                "selection": {
                    "brush": {
                        "type": "interval",
                        "encodings": [
                            "x",
                            "y"
                        ],
                        "mark": {
                            "fill": "#333",
                            "fillOpacity": 0.125,
                            "stroke": "white"
                        },
                        "resolve": "global",
                    }
                },
            },
            {
                "data": {
                    "name": "statuses",
                    "values": statistics.statuses,
                },
                "width": width,
                "height": statusesHeight,
                "mark": "area",
                "encoding": {
                    "x": {
                        "field": "time",
                        "type": "temporal",
                        "axis": {
                            "format": (settings.timeSpan == "threeHours") ? "%H:%M" : "%m/%d %H:%M",
                            "title": "time",
                            "tickCount": 24
                        }
                    },
                    "y": {
                        "field": "request_rate",
                        "type": "quantitative",
                        "aggregate": "sum",
                        "axis": {
                            "title": "traces / sec",
                            "tickCount": 8,
                            "orient": "right",
                        },
                    },
                    "color": {
                        "field": "status",
                        "type": "nominal",
                        "scale": {
                            "range": ["#178B27", "#FA8608", "#600068", "#C40A05"] // ["green", "orange", "purple", "red"]
                        },
                        "legend": {
                            "title": "Status",
                        },
                    }
                },
                "selection": {
                    "brush": {
                        "type": "interval",
                        "encodings": [
                            "x"
                        ],
                        "mark": {
                            "fill": "#333",
                            "fillOpacity": 0.125,
                            "stroke": "white"
                        },
                        "resolve": "global",
                    }
                },
            }
        ]
    };

    var opt = {
        "mode": "vega-lite",
        "actions": false
    };

    scatter.showChart();
    vega.embed("#chart", spec, opt, function(error, result) {
        const view = result.view;
        scatter.view = view;

        view.addEventListener("mouseup", function(event, item) {
            if (view.data('brush_store')[0]) {
                const intervals = view.data('brush_store')[0].intervals;
                const traceTimeRange = {
                    startTime: intervals[0].extent[0],
                    endTime:   intervals[0].extent[1]
                }
                const correctedTimeRange = scatter.correctTraceTimeRange(traceTimeRange);

                traces.showProgress();
                if (intervals.length == 2) {
                    let parameters = {
                        responseTimeMin: intervals[1].extent[1],
                        responseTimeMax: intervals[1].extent[0]
                    }
                    parameters = scatter.correctResponseTimeRange(scatter.statistics.histogram, traceTimeRange.startTime, traceTimeRange.endTime, parameters);

                    scatter.fetch("/traces/responsetime", settings.entity, correctedTimeRange.startTime, correctedTimeRange.endTime, parameters, traces.update);
                } else {
                    const traceStartTime = intervals[0].extent[0];
                    const traceEndTime = intervals[0].extent[1];

                    scatter.fetch("/traces/status", settings.entity, correctedTimeRange.startTime, correctedTimeRange.endTime, {}, traces.update);
                }
            } else {
                traces.clear();
            }
        });
    });
};

scatter.showChart = function() {
    document.getElementById('chart').style.display = "block";
    document.getElementById('loading').style.display = "none";
};

scatter.hideChart = function() {
    document.getElementById('chart').style.display = "none";
    document.getElementById('loading').style.display = "block";
};

// Incrementally add statistics to the view to avoiding re-rendering the whole view on update.
scatter.appendStatistics = function(startTime, endTime, cutOffTime, append) {
    scatter.fetch("/scatter", settings.entity, startTime, endTime, {}, function(data) {
        if (!append) {
            return;
        }

        const statistics = scatter.mergeStatistics(data.statistics, endTime);

        // TODO: named data sources are broken? (https://vega.github.io/vega-lite/docs/data.html#named)
        let histogramSet = "source_0"
        let statusesSet = "source_1"

        if (scatter.view.data("source_0").length > 0 && scatter.view.data("source_0")[0].status) {
            histogramSet = "source_1"
            statusesSet = "source_0"
        }

        scatter.view
               .change(histogramSet, vega.changeset().remove(function(d) { return new Date(d.time) < cutOffTime; }).insert(statistics.histogram))
               .change(statusesSet, vega.changeset().remove(function(d) { return new Date(d.time) < cutOffTime; }).insert(statistics.statuses))
               .run();
    });
};

// Map the data format from the one returned by /scatter to one used by Vega Lite.
scatter.processStatistics = function(statistics) {
    const statusLabels = {
        ok: "​\u200BOk",
        error: "​\u200B\u200BError",
        throttle: "​\u200B\u200B\u200BThrottle",
        fault: "​\u200B\u200B\u200B\u200BFault",
    };
    const data = {
        histogram: [],
        statuses:  [],
        index:     []
    };
    let emitZeros = false;

    for (let slice of statistics) {
        const timestamp = new Date(0);

        timestamp.setUTCSeconds(slice.timestamp);

        if ((slice.index.start_time && slice.index.end_time) || emitZeros) {
            emitZeros = true;

            for (let entry of slice.histogram) {
                data.histogram.push({
                    time:  timestamp.toISOString(),
                    value: entry.value,
                    count: entry.count,
                });
            }

            // There doesn't seem to be any way to create empty datapoints with heatmaps.
            // Use zero value instead to ensure that the views stay in sync if the service
            // or entity not sending any traces for a period of time.
            if (slice.histogram.length == 0) {
                data.histogram.push({
                    time:  timestamp.toISOString(),
                    value: 0,
                    count: 0,
                });
            }

            for (let entry of slice.statuses) {
                data.statuses.push({
                    time:         timestamp.toISOString(),
                    request_rate: entry.request_rate,
                    status:       statusLabels[entry.status] ? statusLabels[entry.status] : entry.status
                });
            }
        }

        if (slice.index.start_time && slice.index.end_time) {
            const startTime = new Date(0);
            const endTime = new Date(0);

            startTime.setUTCSeconds(slice.index.start_time);
            endTime.setUTCSeconds(slice.index.end_time);

            data.index.push({
                time:      timestamp.toISOString(),
                startTime: startTime.toISOString(),
                endTime:   endTime.toISOString()
            });
        }
    }

    return data;
};

// Maintain a cache of visibile statistics entries to allow normalization of selected time and 
// response time ranges.
//
// Returns normalized new statistics entries used to incrementally update the view.
scatter.mergeStatistics = function(rawStatistics, endTime) {
    const cutOffTime = scatter.cutOffTime(endTime);
    const statistics = scatter.processStatistics(rawStatistics);

    scatter.append = true;
    scatter.refreshedAt = new Date();
    scatter.startTime = endTime;

    _.forEach(statistics, (v, k) => {
        if (!scatter.statistics[k]) {
            scatter.statistics[k] = [];
        }
        Array.prototype.push.apply(scatter.statistics[k], v);

        _.remove(scatter.statistics[k], o => { return new Date(o.time) < cutOffTime; });
    });

    return statistics;
}

scatter.fetch = function(path, entityName, startTime, endTime, parameters={}, callback) {
    let data = null;

    const esc = encodeURIComponent;
    const q = _.chain(parameters)
               .map((v, k) => `&${esc(k)}=${esc(v)}`)
               .join('')
               .value();

    fetch(path + "?entity=" + esc(entityName) + "&startTime=" + startTime.getTime() / 1000 + "&endTime=" + endTime.getTime() / 1000 + q, { credentials: 'include' }).then(function(response) {
        if (!response.ok) {
            throw Error(response.statusText + " (" + response.status + ")");
        }

        return response.json();
    }).then(data => {
        scatter.error = null;

        callback(data);
    }).catch(function(error) {
        if (error instanceof TypeError && error.message == "Type error") {
            error = Error("Could not connect to the server");
        }

        scatter.error = error;
        console.log(error);
    });
};

// Returns "safe end time" by rounding down to the nearest minute to avoid reading service graph 
// durations that are still being updated.
scatter.safeEndTime = function() {
    const safeTime = new Date(Math.floor(Date.now() / (scatter.duration * 1.0)) * scatter.duration);

    if (new Date().getTime() - safeTime.getTime() < MINUTE) {
        return new Date(safeTime.getTime() - scatter.duration);
    }

    return safeTime;
};

// Returns earliest start time for given the selected time range (either 3 hours or 7 days).
scatter.cutOffTime = function(endTime) {
    return new Date(endTime.getTime() - scatter.timeSlots * scatter.duration)
};

// Normalize response time range for **GetTraceSummaries** API. Since X-Ray histograms are
// sparse and use non-linear scale the selected response time range has to be normalized before 
// used as **GetTraceSummaries** API range.
//
// Find closest previous and next buckets for the range and add or remove half of the delta
// of the values between the selection and the previous / next buckets to expand the range.
//
// **Note:** this method mutates parameters object.
scatter.correctResponseTimeRange = function(histogram, startTime, endTime, parameters) {
    console.log("before", parameters);

    let startIndex = null;
    let endIndex = null;
    const sortedHistogram = _.sortBy(histogram, o => { return o.value; })

    for (let i = 0; i < sortedHistogram.length; i += 1) {
        const entry = sortedHistogram[i];
        const entryTimestamp = new Date(entry.time);

        if (entryTimestamp >= startTime && entryTimestamp < endTime) {
            // console.log(entry);

            if (entry.value < parameters.responseTimeMin) {
                startIndex = i;
            }

            if (entry.value > parameters.responseTimeMax && endIndex == null) {
                endIndex = i;
            }
        }
    }

    if (startIndex) {
        const entry = sortedHistogram[startIndex];
        parameters.responseTimeMin -= (parameters.responseTimeMin - entry.value) / 2;
    } else {
        delete parameters.responseTimeMin;
    }

    if (endIndex) {
        const entry = sortedHistogram[endIndex];
        parameters.responseTimeMax += (entry.value - parameters.responseTimeMax) / 2;
    } else {
        delete parameters.responseTimeMax;
    }

    console.log("after", parameters);
    return parameters;
};

// Return normalized response time range for **GetTraceSummaries** API by finding minimum
// start time and maximum end time for the selected time range and service or edge by 
// scanning through all service graphs for the selected time ranges.
scatter.correctTraceTimeRange = function(traceTimeRange) {
    console.log("before", traceTimeRange);

    let traceStartTime = new Date(traceTimeRange.startTime)
    let traceEndTime = new Date(traceTimeRange.endTime)

    for (let i = 0; i < scatter.statistics.index.length; i += 1) {
        const entry = scatter.statistics.index[i];
        const entryTimestamp = new Date(entry.time);

        if (entryTimestamp >= traceStartTime && entryTimestamp < traceEndTime) {
            const entryStartTime = new Date(entry.startTime);
            const entryEndTime = new Date(entry.endTime);

            // console.log(entry);

            if (entryStartTime < traceStartTime) {
                traceStartTime = entryStartTime;
            } 

            if (entryEndTime > traceEndTime) {
                traceEndTime = entryEndTime;
            } 
        }
    }

    const correctedTimeRange = {
        startTime: traceStartTime,
        endTime: traceEndTime
    };

    console.log("after", correctedTimeRange);
    return correctedTimeRange;
};
