"use strict";

const cookie = {};

// Based on https://stackoverflow.com/questions/14573223/set-cookie-and-get-cookie-with-javascript

cookie.set = function(name, value, days) {
    let expires = "";
    if (days) {
        let date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + encodeURIComponent(value) + expires + "; path=/";
};

cookie.get = function(name, defaultValue) {
    let nameEQ = name + "=";
    let ca = document.cookie.split(';');
    for (let i=0;i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length));
    }
    return defaultValue;
};

cookie.clear = function(name) {
    cookie.set(name, "", -1);
};
