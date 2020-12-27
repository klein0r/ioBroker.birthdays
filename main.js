'use strict';

const utils = require('@iobroker/adapter-core');
const ical = require('node-ical');
const moment = require('moment');
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
                this.log.debug('ical http request (' + response.status + ')');
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

        const now = moment({hour: 0, minute: 0});
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const birthdays = [];

        ical.async.parseICS(
            data,
            (err, data) => {
                if (data) {
                    for (const e in data) {
                        const event = data[e];

                        if (event.summary !== undefined && !isNaN(event.description) && event.type === 'VEVENT' && event.start && event.start instanceof Date) {
                            const name = event.summary;
                            const day = event.start.getDate();
                            const month = event.start.getMonth(); // month as a number (0-11)
                            const birthYear = parseInt(event.description);

                            this.log.debug('found birthday: ' + name + ' (' + birthYear + ')');

                            let birthday = moment([birthYear, month, day]);
                            let nextBirthday = moment([now.year(), month, day]);

                            if (now.isAfter(nextBirthday) && !now.isSame(nextBirthday)) {
                                nextBirthday.add(1, 'y');
                            }

                            birthdays.push(
                                {
                                    name: name,
                                    birthYear: birthYear,
                                    age: nextBirthday.diff(birthday, 'years'),
                                    daysLeft: nextBirthday.diff(now, 'days')
                                }
                            );
                        }
                    }

                    // Sort by daysLeft
                    birthdays.sort((a, b) => (a.daysLeft > b.daysLeft) ? 1 : -1);

                    this.log.debug('birthdays: ' + JSON.stringify(birthdays));
                }

                // Stop Adapter
                this.stop.bind(this);
            }
        );
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