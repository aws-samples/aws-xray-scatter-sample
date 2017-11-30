"use strict";

const select = {};

select.init = function() {
    select.initEntity();
    select.initTimeSpan();

	scatter.rebuild();
};

select.entityChange = function(entity) {
    console.log("entity", JSON.parse(entity));
    settings.set("entity", entity);
	scatter.rebuild();
};

// Initialize service and edge selection
select.initEntity = function() {
    const selectElement = document.getElementById("entitySelect");
    const endTime = scatter.safeEndTime();
    const startTime = new Date(endTime.getTime() - 5 * 60000);
    let optionSelected = false;

    scatter.fetch("/entities", null, startTime, endTime, {}, function(data) {
        const entities = data.entities;

    	for (const entity of entities) {
            const entityAsJSON = JSON.stringify(entity);

            let label = null;

            if (entity.name) {
                label = entity.name;
                if (entity.type) {
                    label += " (" + entity.type + ")"
                }
            } else {
                label = entity[0].name;
                if (entity[0].type == "client") {
                    label = "client"
                } else if (entity[0].type) {
                    label += " (" + entity[0].type + ")"
                }

                label += " \u2192 "

                label += entity[1].name;
                if (entity[1].type) {
                    label += " (" + entity[1].type + ")"
                }
            }

            const selected = (settings.entity === entityAsJSON);
            selectElement.options[selectElement.options.length] = new Option(label, entityAsJSON, false, selected);

            if (selected) {
                optionSelected = true;
            } 
        }

        selectElement.addEventListener('change', function (e) {
            select.entityChange(e.target.value);
        });

        if (!optionSelected) {
            if (selectElement.options[0]) {
                settings.value = select.entityChange(selectElement.options[0].value);
            } else {
                settings.value = null;
            }
        }

        console.log("entity", selectElement.value != "" ? JSON.parse(selectElement.value) : "n/a");
    });
};

// Initialize time span (3 hours or 7 days) selection
select.initTimeSpan = function() {
    const selectElement = document.getElementById("timeSpanSelect");
    const endTime = scatter.safeEndTime();
    const startTime = new Date(endTime.getTime() - 5 * 60000);

    selectElement.options[0] = new Option("3 Hours", "threeHours", false, (settings.timeSpan == "threeHours"));
    selectElement.options[1] = new Option("7 Days", "sevenDays", false, (settings.timeSpan == "sevenDays"));

    selectElement.addEventListener('change', function (e) {
        const timeSpan = e.target.value;

        console.log("time span", timeSpan);
        settings.set("timeSpan", timeSpan);
    	scatter.rebuild();
    });

    console.log("time span", selectElement.value);
};
