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
        this.today = moment({hour: 0, minute: 0});
        this.birthdays = [];

        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {

        // Create month channels
        for (let m = 1; m <= 12; m++) {
            const mm = moment({ month: m - 1 });

            await this.setObjectNotExistsAsync(this.getMonthPath(m), {
                type: 'channel',
                common: {
                    name: mm.format("MMMM")
                },
                native: {}
            });
        }

        this.addBySettings();

        const iCalUrl = this.config.icalUrl;
        if (iCalUrl) {
            this.addByCalendar(iCalUrl);
        } else {
            this.fillStates();
        }

        this.killTimeout = setTimeout(this.stop.bind(this), 30000);

    }

    addBySettings() {
        const birthdays = this.config.birthdays;
        
        if (birthdays && Array.isArray(birthdays)) {
            for (const b in birthdays) {
                const birthday = birthdays[b];

                const configBirthday = moment({ year: birthday.year, month: birthday.month - 1, day: birthday.day });

                if (configBirthday.isValid()) {
                    this.log.debug('found birthday in settings: ' + birthday.name + ' (' + birthday.year + ')');

                    this.addBirthday(birthday.name, configBirthday.date(), configBirthday.month(), configBirthday.year());
                } else {
                    this.log.warn('invalid birthday date in settings: ' + birthday.name);
                }
            }
        }
    }

    addByCalendar(iCalUrl) {
        this.log.debug('ical url: ' + iCalUrl);

        axios({
            method: 'get',
            url: iCalUrl,
            timeout: 4500
        }).then(
            function (response) {
                this.log.debug('ical http request (' + response.status + ')');
                this.addCalendarBirthdays(response.data);
            }.bind(this)
        ).catch(
            function (error) {
                this.log.warn(error);
                this.fillStates();
            }.bind(this)
        );
    }

    addCalendarBirthdays(data) {
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

                            this.log.debug('found birthday in calendar: ' + name + ' (' + birthYear + ')');

                            this.addBirthday(name, day, month, birthYear);
                        }
                    }

                    this.fillStates();
                }
            }
        );
    }

    addBirthday(name, day, month, birthYear) {

        let birthday = moment([birthYear, month, day]);
        let nextBirthday = moment([this.today.year(), month, day]);

        // If birthday was already this year, add one year to the nextBirthday
        if (this.today.isAfter(nextBirthday) && !this.today.isSame(nextBirthday)) {
            nextBirthday.add(1, 'y');
        }

        this.birthdays.push(
            {
                name: name,
                birthYear: birthYear,
                dateFormat: nextBirthday.format('DD.MM.'),
                age: nextBirthday.diff(birthday, 'years'),
                daysLeft: nextBirthday.diff(this.today, 'days'),
                _nextBirthday: nextBirthday
            }
        );
    }

    async fillStates() {

        // Sort by daysLeft
        this.birthdays.sort((a, b) => (a.daysLeft > b.daysLeft) ? 1 : -1);

        this.log.debug('birthdays: ' + JSON.stringify(this.birthdays));
        this.setState('summary.json', {val: JSON.stringify(this.birthdays), ack: true});

        const keepBirthdays = [];
        const allBirhtdays = (await this.getChannelsOfAsync('month'))
            .map(obj => { return this.removeNamespace(obj._id) })
            .filter(id => new RegExp('month\.[0-9]{2}\..+', 'g').test(id));

        for (const b in this.birthdays) {
            const birthday = this.birthdays[b];

            const cleanName = this.cleanNamespace(birthday.name);
            const nextBirthday = birthday._nextBirthday;
            const monthPath = this.getMonthPath(nextBirthday.month() + 1) + '.' + cleanName;

            keepBirthdays.push(monthPath);

            await this.setObjectNotExistsAsync(monthPath, {
                type: 'channel',
                common: {
                    name: birthday.name
                },
                native: {}
            });

            await this.setObjectNotExistsAsync(monthPath + '.name', {
                type: 'state',
                common: {
                    name: 'Name',
                    type: 'string',
                    role: 'value',
                    read: true,
                    write: false
                },
                native: {}
            });
            await this.setStateAsync(monthPath + '.name', {val: birthday.name, ack: true});

            await this.setObjectNotExistsAsync(monthPath + '.age', {
                type: 'state',
                common: {
                    name: 'New age',
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false
                },
                native: {}
            });
            await this.setStateAsync(monthPath + '.age', {val: birthday.age, ack: true});

            await this.setObjectNotExistsAsync(monthPath + '.day', {
                type: 'state',
                common: {
                    name: 'Day of month',
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false
                },
                native: {}
            });
            await this.setStateAsync(monthPath + '.day', {val: nextBirthday.date(), ack: true});

            await this.setObjectNotExistsAsync(monthPath + '.year', {
                type: 'state',
                common: {
                    name: 'Birth year',
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false
                },
                native: {}
            });
            await this.setStateAsync(monthPath + '.year', {val: birthday.birthYear, ack: true});

            await this.setObjectNotExistsAsync(monthPath + '.daysLeft', {
                type: 'state',
                common: {
                    name: 'Days left',
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false
                },
                native: {}
            });
            await this.setStateAsync(monthPath + '.daysLeft', {val: birthday.daysLeft, ack: true});
        }

        // Delete non existent birthdays
        for (let i = 0; i < allBirhtdays.length; i++) {
            const id = allBirhtdays[i];

            if (keepBirthdays.indexOf(id) === -1) {
                this.delObject(id, {recursive: true}, () => {
                    this.log.debug('Birthday deleted: "' + id + '"');
                });
            }
        }

        // next birthdays
        if (this.birthdays.length > 0) {
            const nextBirthdayDaysLeft = this.birthdays[0].daysLeft;
            const nextBirthdays = this.birthdays.filter(birthday => birthday.daysLeft == nextBirthdayDaysLeft); // get all birthdays with same days left

            this.log.debug('next birthday(s): ' + JSON.stringify(nextBirthdays));
            
        }
    }

    getMonthPath(m) {
        return 'month.' + new String(m).padStart(2, '0');
    }

    cleanNamespace(id) {
        return id
            .trim()
            .replace(/\s/g, '_') // Replace whitespaces with underscores
            .replace(/[^\p{Ll}\p{Lu}\p{Nd}]+/gu, '_') // Replace not allowed chars with underscore
            .replace(/[_]+$/g, '') // Remove underscores end
            .replace(/^[_]+/g, '') // Remove underscores beginning
            .replace(/_+/g, '_') // Replace multiple underscores with one
            .toLowerCase()
            .replace(/_([a-z])/g, (m, w) => {
                return w.toUpperCase();
            });
    }

    removeNamespace(id) {
        const re = new RegExp(this.namespace + '*\.', 'g');
        return id.replace(re, '');
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