'use strict';

const utils = require('@iobroker/adapter-core');
const ical = require('node-ical');
const axios = require('axios');
const adapterName = require('./package.json').name.split('.').pop();

class Birthdays extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: adapterName,
        });

        this.killTimeout = null;

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        const iCalUrl = this.config.icalUrl;

        this.killTimeout = setTimeout(this.stop.bind(this), 30000);

        if (iCalUrl) {
            this.getCalendar(iCalUrl);
        }
    }

    getCalendar(iCalUrl) {
        this.log.debug('ical url: ' + iCalUrl);

        axios({
            method: 'get',
            url: iCalUrl,
            timeout: 4500
        }).then(
            function (response) {
                this.log.debug('ical http request (' + response.status + '): ' + JSON.stringify(response.data));
                this.refreshBirthdays(response.data);
            }.bind(this)
        ).catch(
            function (error) {
                this.log.warn(error);
            }.bind(this)
        );
    }

    refreshBirthdays(data) {
        this.log.debug('ical data: ' + data);

        // Stop Adapter
        this.stop.bind(this)
    }

    onUnload(callback) {
        try {

            if (this.killTimeout) {
                this.log.debug('clearing kill timeout');
                clearTimeout(this.killTimeout);
            }

            this.log.debug('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
}

// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Birthdays(options);
} else {
    // otherwise start the instance directly
    new Birthdays();
}