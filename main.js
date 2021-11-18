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
            useFormatDate: true
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
                    name: mm.format('MMMM')
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

        this.killTimeout = this.setTimeout(this.stop.bind(this), 30000);
    }

    addBySettings() {
        const birthdays = this.config.birthdays;

        if (birthdays && Array.isArray(birthdays)) {
            for (const b in birthdays) {
                const birthday = birthdays[b];

                const configBirthday = moment({ year: birthday.year, month: birthday.month - 1, day: birthday.day });

                if (configBirthday.isValid() && configBirthday.year() <= this.today.year()) {
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
        }).then((response) => {
            this.log.debug('ical http request (' + response.status + ')');
            this.addCalendarBirthdays(response.data);
        }).catch((error) => {
            this.log.warn(error);
            this.fillStates();
        });
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

                            if (!isNaN(birthYear) && birthYear <= this.today.year()) {
                                this.log.debug('found birthday in calendar: ' + name + ' (' + birthYear + ')');

                                this.addBirthday(name, day, month, birthYear);
                            } else {
                                this.log.warn('invalid birthday date in calendar: ' + name);
                            }
                        }
                    }

                    this.fillStates();
                }
            }
        );
    }

    addBirthday(name, day, month, birthYear) {

        const birthday = moment([birthYear, month, day]);
        const nextBirthday = moment([this.today.year(), month, day]);

        // If birthday was already this year, add one year to the nextBirthday
        if (this.today.isAfter(nextBirthday) && !this.today.isSame(nextBirthday)) {
            nextBirthday.add(1, 'y');
        }

        this.birthdays.push(
            {
                name: name,
                birthYear: birthYear,
                dateFormat: this.formatDate(nextBirthday.toDate()),
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
        await this.setStateAsync('summary.json', {val: JSON.stringify(this.birthdays), ack: true});

        const keepBirthdays = [];
        const allBirhtdays = (await this.getChannelsOfAsync('month'))
            .map(obj => { return this.removeNamespace(obj._id); })
            .filter(id => new RegExp('month\.[0-9]{2}\..+', 'g').test(id));

        for (const b in this.birthdays) {
            const birthday = this.birthdays[b];

            const cleanName = this.cleanNamespace(birthday.name);
            const monthPath = this.getMonthPath(birthday._nextBirthday.month() + 1) + '.' + cleanName;

            keepBirthdays.push(monthPath);

            if (allBirhtdays.indexOf(monthPath) === -1) {
                this.log.debug('birthday added: ' + monthPath);
            }

            await this.fillPathWithBirhtday(monthPath, birthday);
        }

        // Delete non existent birthdays
        for (let i = 0; i < allBirhtdays.length; i++) {
            const id = allBirhtdays[i];

            if (keepBirthdays.indexOf(id) === -1) {
                this.delObject(id, {recursive: true}, () => {
                    this.log.debug('birthday deleted: ' + id);
                });
            }
        }

        // next birthdays
        if (this.birthdays.length > 0) {
            const nextBirthdayDaysLeft = this.birthdays[0].daysLeft;

            await this.fillAfter('next', nextBirthdayDaysLeft);

            const nextAfterBirthdaysList = this.birthdays.filter(birthday => birthday.daysLeft > nextBirthdayDaysLeft);
            if (nextAfterBirthdaysList.length > 0) {
                const nextAfterBirthdaysLeft = nextAfterBirthdaysList[0].daysLeft;

                await this.fillAfter('nextAfter', nextAfterBirthdaysLeft);
            }
        }

    }

    async fillAfter(path, daysLeft) {

        this.log.debug('filling ' + path + ' with ' + daysLeft + ' days left');

        const nextBirthdays = this.birthdays
            .filter(birthday => birthday.daysLeft == daysLeft); // get all birthdays with same days left

        const nextBirthdaysText = nextBirthdays.map(
            birthday => {
                return this.config.nextTextTemplate
                    .replace('%n', birthday.name)
                    .replace('%a', birthday.age);
            }
        );

        await this.setStateAsync(path + '.json', {val: JSON.stringify(nextBirthdays), ack: true});
        await this.setStateAsync(path + '.daysLeft', {val: daysLeft, ack: true});
        await this.setStateAsync(path + '.text', {val: nextBirthdaysText.join(this.config.nextSeparator), ack: true});

        const birthdayDate = moment()
            .set({'hour': 0, 'minute': 0, 'second': 0})
            .add(daysLeft, 'days');

        await this.setStateAsync(path + '.date', {val: birthdayDate.valueOf(), ack: true});
        await this.setStateAsync(path + '.dateFormat', {val: this.formatDate(birthdayDate.toDate()), ack: true});
    }

    async fillPathWithBirhtday(path, birthday) {

        const nextBirthday = birthday._nextBirthday;

        await this.setObjectNotExistsAsync(path, {
            type: 'channel',
            common: {
                name: birthday.name
            },
            native: {}
        });

        await this.setObjectNotExistsAsync(path + '.name', {
            type: 'state',
            common: {
                name: {
                    en: 'Name',
                    de: 'Name',
                    ru: 'Имя',
                    pt: 'Nome',
                    nl: 'Naam',
                    fr: 'Nom',
                    it: 'Nome',
                    es: 'Nombre',
                    pl: 'Nazwa',
                    'zh-cn': '姓名'
                },
                type: 'string',
                role: 'value',
                read: true,
                write: false
            },
            native: {}
        });
        await this.setStateAsync(path + '.name', {val: birthday.name, ack: true});

        await this.setObjectNotExistsAsync(path + '.age', {
            type: 'state',
            common: {
                name: {
                    en: 'Age',
                    de: 'Alter',
                    ru: 'Возраст',
                    pt: 'Era',
                    nl: 'Leeftijd',
                    fr: 'Âge',
                    it: 'Età',
                    es: 'La edad',
                    pl: 'Wiek',
                    'zh-cn': '年龄'
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false
            },
            native: {}
        });
        await this.setStateAsync(path + '.age', {val: birthday.age, ack: true});

        await this.setObjectNotExistsAsync(path + '.day', {
            type: 'state',
            common: {
                name: {
                    en: 'Day of month',
                    de: 'Monatstag',
                    ru: 'День месяца',
                    pt: 'Dia do mês',
                    nl: 'Dag van de maand',
                    fr: 'Jour du mois',
                    it: 'Giorno del mese',
                    es: 'Dia del mes',
                    pl: 'Dzień miesiąca',
                    'zh-cn': '每月的第几天'
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false
            },
            native: {}
        });
        await this.setStateAsync(path + '.day', {val: nextBirthday.date(), ack: true});

        await this.setObjectNotExistsAsync(path + '.year', {
            type: 'state',
            common: {
                name: {
                    en: 'Birth year',
                    de: 'Geburtsjahr',
                    ru: 'Год рождения',
                    pt: 'Ano de Nascimento',
                    nl: 'Geboortejaar',
                    fr: 'Année de naissance',
                    it: 'Anno di nascita',
                    es: 'Año de nacimiento',
                    pl: 'Rok urodzenia',
                    'zh-cn': '出生年'
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false
            },
            native: {}
        });
        await this.setStateAsync(path + '.year', {val: birthday.birthYear, ack: true});

        await this.setObjectNotExistsAsync(path + '.daysLeft', {
            type: 'state',
            common: {
                name: {
                    en: 'Days left',
                    de: 'Tage übrig',
                    ru: 'Осталось дней',
                    pt: 'Dias restantes',
                    nl: 'Dagen over',
                    fr: 'Jours restants',
                    it: 'Giorni rimasti',
                    es: 'Días restantes',
                    pl: 'Pozostałe dni',
                    'zh-cn': '剩余天数'
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false
            },
            native: {}
        });
        await this.setStateAsync(path + '.daysLeft', {val: birthday.daysLeft, ack: true});
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
                this.clearTimeout(this.killTimeout);
            }

            this.log.debug('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
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