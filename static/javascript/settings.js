"use strict";

const DEFAULT_REGION = "us-east-1";
const DEFAULT_ENTITY = null
const DEFAULT_TIMESPAN = "threeHours";

const settings = {};

settings.region = cookie.get("region", DEFAULT_REGION);
settings.entity = cookie.get("entity", DEFAULT_ENTITY);
settings.timeSpan = cookie.get("timeSpan", DEFAULT_TIMESPAN);
settings.rebuild = false;

settings.set = function(key, value) {
	settings[key] = value;
	cookie.set(key, value, 21);
};

settings.init = function() {
	const makeRadioButton = function(name, value, text, checked) {
	  let label = document.createElement("label");
	  let radio = document.createElement("input");

	  radio.type = "radio";
	  radio.name = name;
	  radio.value = value;
	  if (checked) {
	      radio.checked = "checked";
	  }

	  label.appendChild(radio);
	  label.appendChild(document.createTextNode(text));
	  label.style.display = "block";

	  return label;
	}

	const regions = [
	    "us-east-1",
	    "us-west-2",
	    "eu-west-1",
	    "us-west-1",
	    "eu-west-2",
	    "ap-south-1",
	    "ap-southeast-1",
	    "us-east-2",
	    "eu-central-1",
	    "sa-east-1",
	    "ap-northeast-1",
	    "ap-northeast-2",
	    "ap-southeast-2",
	    "ca-central-1",
	]

	for (const region of regions) {
	    let button = makeRadioButton("region", region, region, (settings.region == region));
	    document.getElementById("regions").appendChild(button);
	}

	// Event listener for region selection (https://stackoverflow.com/questions/8838648/onchange-event-handler-for-radio-button-input-type-radio-doesnt-work-as-one?rq=1)
	const regionForm = document.getElementById('regionFormDiv');
	let prev = null;
	for (let i = 0; i < regionForm.length; i++) {
	    regionForm[i].onclick = function() {
	        if(this !== prev) {
	            prev = this;
				settings.set("region", this.value);
                settings.rebuild = true;
	        }
	    };
	}
};
