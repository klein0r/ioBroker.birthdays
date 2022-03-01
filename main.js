'use strict';

const utils = require('@iobroker/adapter-core');
const ical = require('node-ical');
const moment = require('moment');
const axios = require('axios');
const https = require('https');
const { createDAVClient } = require('tsdav');
const ICAL = require('ical.js');
const adapterName = require('./package.json').name.split('.').pop();

class Birthdays extends utils.Adapter {

    constructor(options) {
        super({
            ...options,
            name: adapterName,
            useFormatDate: true
        });

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
                    name: {
                        en: this.getMonthTranslation(mm, 'en'),
                        de: this.getMonthTranslation(mm, 'de'),
                        ru: this.getMonthTranslation(mm, 'ru'),
                        pt: this.getMonthTranslation(mm, 'pt'),
                        nl: this.getMonthTranslation(mm, 'nl'),
                        fr: this.getMonthTranslation(mm, 'fr'),
                        it: this.getMonthTranslation(mm, 'it'),
                        es: this.getMonthTranslation(mm, 'es'),
                        pl: this.getMonthTranslation(mm, 'pl'),
                        'zh-cn': this.getMonthTranslation(mm, 'zh-cn')
                    }
                },
                native: {}
            });
        }

        Promise.all(
            [
                this.addBySettings(),
                this.addByCalendar(),
                this.addByCardDav()
            ]
        ).then(async (data) => {
            await this.fillStates();
            this.stop();
        });
    }

    async addBySettings() {
        return new Promise((resolve) => {
            const birthdays = this.config.birthdays;
            let addedBirthdays = 0;

            if (birthdays && Array.isArray(birthdays)) {
                for (const b in birthdays) {
                    const birthday = birthdays[b];

                    if (birthday.name) {
                        const configBirthday = moment({ year: birthday.year, month: birthday.month - 1, day: birthday.day });

                        if (configBirthday.isValid() && configBirthday.year() <= this.today.year()) {
                            this.log.debug(`[settings] found birthday: ${birthday.name} (${birthday.year})`);

                            this.addBirthday(birthday.name, configBirthday);
                            addedBirthdays++;
                        } else {
                            this.log.warn(`[settings] invalid birthday date: ${birthday.name}`);
                        }
                    }
                }
            }

            this.log.debug(`[settings] done`);
            resolve(addedBirthdays);
        });
    }

    async addByCalendar() {
        return new Promise((resolve) => {
            const iCalUrl = this.config.icalUrl;
            if (iCalUrl) {
                this.log.debug(`[ical] url: ${iCalUrl}`);

                const httpsAgentOptions = {};

                if (this.config.icalUrlIgnoreCertErrors) {
                    this.log.debug('[ical] addByCalendar - performing https requests with rejectUnauthorized = false');
                    httpsAgentOptions.rejectUnauthorized = false;
                }

                axios({
                    method: 'get',
                    url: iCalUrl,
                    timeout: 4500,
                    httpsAgent: new https.Agent(httpsAgentOptions)
                }).then(async (response) => {
                    this.log.debug(`[ical] http request finished with status: ${response.status}`);
                    const addedBirthdays = await this.addCalendarBirthdays(response.data);

                    resolve(addedBirthdays);
                }).catch((error) => {
                    this.log.warn(error);
                    this.log.debug(`[ical] done with error`);
                    resolve(0);
                });
            } else {
                this.log.debug(`[ical] done - url not configured - skipped`);
                resolve(0);
            }
        });
    }

    async addCalendarBirthdays(data) {
        return new Promise((resolve) => {
            ical.async.parseICS(
                data,
                (err, data) => {
                    let addedBirthdays = 0;

                    if (data) {
                        for (const e in data) {
                            const event = data[e];

                            if (event.summary !== undefined && !isNaN(event.description) && event.type === 'VEVENT' && event.start && event.start instanceof Date) {
                                const name = event.summary;
                                const birthYear = parseInt(event.description);

                                this.log.debug(`[ical] processing event: ${JSON.stringify(event)}`);

                                if (name && birthYear && !isNaN(birthYear)) {
                                    const calendarBirthday = moment({ year: birthYear, month: event.start.getMonth(), day: event.start.getDate() });

                                    if (calendarBirthday.isValid() && calendarBirthday.year() <= this.today.year()) {
                                        this.log.debug(`[ical] found birthday: ${name} (${birthYear})`);

                                        this.addBirthday(name, calendarBirthday);
                                        addedBirthdays++;
                                    } else {
                                        this.log.warn(`[ical] invalid birthday date: ${name}`);
                                    }
                                }
                            }
                        }
                    }

                    resolve(addedBirthdays);
                }
            );
        });
    }

    async addByCardDav() {
        return new Promise(async (resolve) => {
            const carddavUrl = this.config.carddavUrl;
            if (carddavUrl) {
                this.log.debug(`[carddav] url: ${carddavUrl}`);
                let addedBirthdays = 0;

                const client = await createDAVClient(
                    {
                        serverUrl: carddavUrl,
                        credentials: {
                            username: this.config.carddavUser,
                            password: this.config.carddavPassword,
                        },
                        authMethod: 'Basic',
                        defaultAccountType: 'carddav'
                    }
                );

                const addressBooks = await client.fetchAddressBooks();

                this.log.debug(`[carddav] found address books: ${JSON.stringify(addressBooks)}`);

                const vcards = await client.fetchVCards({
                    addressBook: addressBooks[0], // Always fetch first address book
                });

                for (const v in vcards) {
                    const vcard = vcards[v];

                    this.log.debug(`[carddav] processing vcard: ${JSON.stringify(vcard)}`);

                    // Parse VCARD
                    const vcardData = ICAL.parse(vcard.data);

                    var comp = new ICAL.Component(vcardData);
                    var name = comp.getFirstPropertyValue('fn');
                    var bday = comp.getFirstPropertyValue('bday');

                    if (name) {
                        const carddavBirthday = moment(bday, 'YYYY-MM-DD');

                        if (carddavBirthday.isValid() && carddavBirthday.year() <= this.today.year()) {
                            this.log.debug(`[carddav] found birthday: ${name} (${carddavBirthday.year()})`);

                            this.addBirthday(name, carddavBirthday);
                            addedBirthdays++;
                        }
                    }
                }

                this.log.debug(`[carddav] done`);
                resolve(addedBirthdays);
            } else {
                this.log.debug(`[carddav] done - url not configured - skipped`);
                resolve(0);
            }
        });
    }

    addBirthday(name, birthday) {
        const nextBirthday = birthday.clone();
        nextBirthday.add(this.today.year() - birthday.year(), 'y');

        // If birthday was already this year, add one year to the nextBirthday
        if (this.today.isAfter(nextBirthday) && !this.today.isSame(nextBirthday)) {
            nextBirthday.add(1, 'y');
        }

        this.birthdays.push(
            {
                name: name,
                birthYear: birthday.year(),
                dateFormat: this.formatDate(nextBirthday.toDate()),
                age: nextBirthday.diff(birthday, 'years'),
                daysLeft: nextBirthday.diff(this.today, 'days'),
                _birthday: birthday,
                _nextBirthday: nextBirthday
            }
        );
    }

    async fillStates() {

        // Sort by daysLeft
        this.birthdays.sort((a, b) => (a.daysLeft > b.daysLeft) ? 1 : -1);

        this.log.debug(`[fillStates] birthdays: ${JSON.stringify(this.birthdays)}`);
        await this.setStateAsync('summary.json', {val: JSON.stringify(this.birthdays), ack: true});

        const keepBirthdays = [];
        const allBirhtdays = (await this.getChannelsOfAsync('month'))
            .map(obj => { return this.removeNamespace(obj._id); })
            .filter(id => new RegExp('month\.[0-9]{2}\..+', 'g').test(id));

        for (const b in this.birthdays) {
            const birthdayObj = this.birthdays[b];

            const cleanName = this.cleanNamespace(birthdayObj.name);
            const monthPath = this.getMonthPath(birthdayObj._birthday.month() + 1) + '.' + cleanName;

            keepBirthdays.push(monthPath);

            if (allBirhtdays.indexOf(monthPath) === -1) {
                this.log.debug('birthday added: ' + monthPath);
            }

            await this.fillPathWithBirthday(monthPath, birthdayObj);
        }

        // Delete non existent birthdays
        for (let i = 0; i < allBirhtdays.length; i++) {
            const id = allBirhtdays[i];

            if (keepBirthdays.indexOf(id) === -1) {
                this.delObject(id, {recursive: true}, () => {
                    this.log.debug(`[fillStates] birthday deleted: ${id}`);
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

        this.log.debug(`[fillAfter] filling ${path} with ${daysLeft} days left`);

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

    async fillPathWithBirthday(path, birthdayObj) {
        this.log.debug(`fillPathWithBirthday - path: "${path}", birthday: ${JSON.stringify(birthdayObj)}`);

        const birthday = birthdayObj._birthday;
        const nextBirthday = birthdayObj._nextBirthday;

        await this.setObjectNotExistsAsync(path, {
            type: 'channel',
            common: {
                name: birthdayObj.name
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
                role: 'text',
                read: true,
                write: false
            },
            native: {}
        });
        await this.setStateAsync(path + '.name', {val: birthdayObj.name, ack: true});

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
        await this.setStateAsync(path + '.age', {val: birthdayObj.age, ack: true});

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
        await this.setStateAsync(path + '.day', {val: birthday.date(), ack: true});

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
        await this.setStateAsync(path + '.year', {val: birthdayObj.birthYear, ack: true});

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
        await this.setStateAsync(path + '.daysLeft', {val: birthdayObj.daysLeft, ack: true});
    }

    getMonthPath(m) {
        return 'month.' + new String(m).padStart(2, '0');
    }

    getMonthTranslation(moment, locale) {
        const momentCopy = moment.clone();
        momentCopy.locale(locale);

        return momentCopy.format('MMMM');
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
        const re = new RegExp(this.namespace + '*\\.', 'g');
        return id.replace(re, '');
    }

    onUnload(callback) {
        try {
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
