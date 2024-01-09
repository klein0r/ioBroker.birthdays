'use strict';

const utils = require('@iobroker/adapter-core');
const fs = require('node:fs');
const moment = require('moment');
const axios = require('axios').default;
const https = require('node:https');
const ICAL = require('ical.js');
const adapterName = require('./package.json').name.split('.').pop();

class Birthdays extends utils.Adapter {
    constructor(options) {
        super({
            ...options,
            name: adapterName,
            useFormatDate: true,
        });

        this.today = moment({ hour: 0, minute: 0 });
        this.birthdays = [];
        this.birthdaysSignificant = [];

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
                        uk: this.getMonthTranslation(mm, 'uk'),
                        'zh-cn': this.getMonthTranslation(mm, 'zh-cn'),
                    },
                },
                native: {},
            });

            await this.setObjectNotExistsAsync(`${this.getMonthPath(m)}.count`, {
                type: 'state',
                common: {
                    name: {
                        en: 'Number of birthdays',
                        de: 'Anzahl der Geburtstage',
                        ru: 'Количество дней рождения',
                        pt: 'Número de aniversários',
                        nl: 'Nummer van verjaardagen',
                        fr: `Nombre d' anniversaires`,
                        it: 'Numero di compleanni',
                        es: 'Número de cumpleaños',
                        pl: 'Liczba urodzin',
                        uk: 'Кількість днів',
                        'zh-cn': '出生日数',
                    },
                    type: 'number',
                    role: 'value',
                    read: true,
                    write: false,
                },
                native: {},
            });

            await this.setObjectNotExistsAsync(`${this.getMonthPath(m)}.json`, {
                type: 'state',
                common: {
                    name: {
                        en: 'Birthdays JSON',
                        de: 'Geburtstage JSON',
                        ru: 'Дни рождения JSON',
                        pt: 'JSON de aniversários',
                        nl: 'Verjaardagen JSON',
                        fr: 'Anniversaires JSON',
                        it: 'Compleanni JSON',
                        es: 'Cumpleaños JSON',
                        pl: 'Urodziny JSON',
                        uk: 'День народження JSON',
                        'zh-cn': '生日 JSON',
                    },
                    type: 'string',
                    role: 'json',
                    read: true,
                    write: false,
                },
                native: {},
            });
        }

        Promise.all([this.addBySettings(), this.addByCalendar(), this.addByCardDav()])
            .then((data) => {
                this.log.debug(`[onReady] everything collected: ${JSON.stringify(data)}`);

                const addedBirthdaysSum = data.reduce((pv, cv) => pv + cv, 0);
                if (addedBirthdaysSum === 0) {
                    this.log.error(`No birthdays found in any configured source - please check configuration and retry`);
                }

                return this.fillStates();
            })
            .then(() => {
                this.log.debug(`[onReady] Everything done`);
            })
            .catch((err) => {
                this.log.error(`[onReady] Error: ${JSON.stringify(err)}`);
            })
            .finally(() => {
                this.log.debug(`[onReady] Finally shutting down`);
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

                            if (this.addBirthday(birthday.name, configBirthday)) {
                                addedBirthdays++;
                            }
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
                this.log.debug(`[ical] url/path: ${iCalUrl}`);

                if (iCalUrl.startsWith('http')) {
                    this.log.debug('[ical] addByCalendar - looks like an http url, performing get request');

                    const httpsAgentOptions = {};

                    if (this.config.icalUrlIgnoreCertErrors) {
                        this.log.debug('[ical] addByCalendar - performing https requests with rejectUnauthorized = false');
                        httpsAgentOptions.rejectUnauthorized = false;
                    }

                    axios({
                        method: 'get',
                        url: iCalUrl,
                        timeout: 4500,
                        httpsAgent: new https.Agent(httpsAgentOptions),
                        auth: {
                            username: this.config.icalUser,
                            password: this.config.icalPassword,
                        },
                    })
                        .then(async (response) => {
                            this.log.debug(`[ical] http(s) request finished with status: ${response.status}`);
                            let addedBirthdays = 0;

                            if (response.data) {
                                this.log.silly(`[ical] addByCalendar - received file contents: ${response.data}`);

                                addedBirthdays = await this.addByIcalData(response.data);
                            }

                            resolve(addedBirthdays);
                        })
                        .catch((error) => {
                            this.log.warn(`[ical] ${error}`);
                            this.log.debug(`[ical] done with error`);
                            resolve(0);
                        });
                } else {
                    try {
                        this.log.debug('[ical] addByCalendar - try to load local file');

                        // local file
                        if (fs.existsSync(iCalUrl)) {
                            const data = fs.readFileSync(iCalUrl).toString();
                            this.log.silly(`[ical] addByCalendar - loaded file contents: ${data}`);

                            this.addByIcalData(data).then((addedBirthdays) => {
                                resolve(addedBirthdays);
                            });
                        } else {
                            this.log.error(`[ical] local file "${iCalUrl}" doesn't exists`);
                            resolve(0);
                        }
                    } catch (err) {
                        this.log.error(`[ical] error when loading local file "${iCalUrl}": ${err}`);
                        resolve(0);
                    }
                }
            } else {
                this.log.debug(`[ical] done - url not configured - skipped`);
                resolve(0);
            }
        });
    }

    async addByIcalData(dataStr) {
        return new Promise((resolve) => {
            let addedBirthdays = 0;

            try {
                // Parse ical
                const icalData = ICAL.parse(dataStr);
                const comp = new ICAL.Component(icalData);
                const vevents = comp.getAllSubcomponents('vevent');

                this.log.debug(`[ical] found ${vevents.length} events`);

                for (const vevent of vevents) {
                    const event = new ICAL.Event(vevent);

                    if (event.summary !== undefined && !isNaN(event.description) && event.startDate) {
                        const name = event.summary;
                        const birthYear = parseInt(event.description);

                        this.log.debug(`[ical] processing event: ${JSON.stringify(event)} - ${event.isRecurring() ? Object.keys(event.getRecurrenceTypes()) : 'not recurring!'}`);

                        if (name && birthYear && !isNaN(birthYear)) {
                            const startDate = event.startDate.toJSDate();
                            const calendarBirthday = moment({ year: birthYear, month: startDate.getMonth(), day: startDate.getDate() });

                            if (calendarBirthday.isValid() && calendarBirthday.year() <= this.today.year()) {
                                this.log.debug(`[ical] found birthday: ${name} (${birthYear})`);

                                if (!event.isRecurring()) {
                                    this.log.warn(`[ical] birthday event of ${name} is not defined as recurring - will be skipped in future versions: ${JSON.stringify(event)}`);
                                } else if (!Object.keys(event.getRecurrenceTypes()).includes('YEARLY')) {
                                    this.log.warn(`[ical] birthday event of ${name} is not recurring yearly - will be skipped in future versions: ${JSON.stringify(event)}`);
                                }

                                if (this.addBirthday(name, calendarBirthday)) {
                                    addedBirthdays++;
                                }
                            } else {
                                this.log.warn(`[ical] invalid birthday date: ${name}`);
                            }
                        } else if (name) {
                            this.log.debug(`[ical] missing birth year in event description: ${name}`);
                        }
                    }
                }

                this.log.debug(`[ical] processed all events`);
            } catch (err) {
                this.log.error(`[ical] unable to parse ical data (invalid file format?): ${err}`);
            }

            resolve(addedBirthdays);
        });
    }

    async addByCardDav() {
        return new Promise((resolve) => {
            const carddavUrl = this.config.carddavUrl;
            if (carddavUrl) {
                this.log.debug(`[carddav] url: ${carddavUrl}`);

                const httpsAgentOptions = {};

                if (this.config.carddavIgnoreCertErrors) {
                    this.log.debug('[carddav] addByCardDav - performing https requests with rejectUnauthorized = false');
                    httpsAgentOptions.rejectUnauthorized = false;
                }

                axios({
                    method: 'get',
                    url: carddavUrl,
                    timeout: 4500,
                    httpsAgent: new https.Agent(httpsAgentOptions),
                    auth: {
                        username: this.config.carddavUser,
                        password: this.config.carddavPassword,
                    },
                })
                    .then((response) => {
                        this.log.debug(`[carddav] http(s) request finished with status: ${response.status}`);
                        let addedBirthdays = 0;

                        if (response.data) {
                            // Parse vcards
                            const vcards = ICAL.parse(response.data);

                            this.log.debug(`[carddav] found ${vcards.length} contacts`);

                            for (const vcard of vcards) {
                                this.log.debug(`[carddav] processing vcard: ${JSON.stringify(vcard)}`);

                                const comp = new ICAL.Component(vcard);
                                const name = comp.getFirstPropertyValue('fn');
                                const bday = comp.getFirstPropertyValue('bday');

                                if (name && bday) {
                                    const carddavBirthday = moment(bday, 'YYYY-MM-DD');

                                    if (carddavBirthday.isValid() && carddavBirthday.year() <= this.today.year()) {
                                        this.log.debug(`[carddav] found birthday: ${name} (${carddavBirthday.year()})`);

                                        if (this.addBirthday(name, carddavBirthday)) {
                                            addedBirthdays++;
                                        }
                                    } else {
                                        this.log.warn(`[carddav] invalid birthdate: ${name}`);
                                    }
                                } else if (name) {
                                    this.log.debug(`[carddav] missing birthdate in event: ${name}`);
                                }
                            }
                        }

                        this.log.debug(`[carddav] done`);
                        resolve(addedBirthdays);
                    })
                    .catch((error) => {
                        this.log.warn(`[carddav] ${error}`);
                        this.log.debug(`[carddav] done with error`);
                        resolve(0);
                    });
            } else {
                this.log.debug(`[carddav] done - url not configured - skipped`);
                resolve(0);
            }
        });
    }

    addBirthday(name, birthday) {
        const id = String(name+"_"+birthday.year()+birthday.month()+birthday.day());
        const birthdaysSameName = this.birthdays.find((b) => b.id === id);
        if (birthdaysSameName) {
            this.log.warn(`[addBirthday] birthday with name "${name}" has already been added (${birthdaysSameName.dateFormat}) - skipping`);
            return false;
        }

        const nextBirthday = birthday.clone();
        nextBirthday.add(this.today.year() - birthday.year(), 'y');

        // If birthday was already this year, add one year to the nextBirthday
        if (this.today.isAfter(nextBirthday) && !this.today.isSame(nextBirthday)) {
            nextBirthday.add(1, 'y');
        }

        const nextAge = nextBirthday.diff(birthday, 'years');

        this.birthdays.push({
            id: id,
            name: name,
            birthYear: birthday.year(),
            dateFormat: this.formatDate(nextBirthday.toDate()),
            age: nextAge,
            currentAgeText: this.getCurrentAgeAsText(birthday),
            daysLeft: nextBirthday.diff(this.today, 'days'),
            _birthday: birthday,
            _nextBirthday: nextBirthday,
        });

        const nextSignificantBirthday = nextBirthday.clone();
        const nextSignficantAge = Math.ceil(nextAge / 10) * 10;

        if (nextSignficantAge > nextAge) {
            nextSignificantBirthday.add(nextSignficantAge - nextAge, 'y');
        }

        this.birthdaysSignificant.push({
            name: name,
            birthYear: birthday.year(),
            dateFormat: this.formatDate(nextSignificantBirthday.toDate()),
            age: nextSignificantBirthday.diff(birthday, 'years'),
            daysLeft: nextSignificantBirthday.diff(this.today, 'days'),
            _birthday: birthday,
            _nextBirthday: nextSignificantBirthday,
        });

        return true;
    }

    async fillStates() {
        // Sort by daysLeft
        this.birthdays.sort((a, b) => (a.daysLeft > b.daysLeft ? 1 : -1));
        this.birthdaysSignificant.sort((a, b) => (a.daysLeft > b.daysLeft ? 1 : -1));

        this.log.debug(`[fillStates] birthdays: ${JSON.stringify(this.birthdays)}`);
        await this.setStateAsync('summary.json', { val: JSON.stringify(this.birthdays), ack: true });
        await this.setStateAsync('summary.count', { val: this.birthdays.length, ack: true });

        this.log.debug(`[fillStates] birthdays significant: ${JSON.stringify(this.birthdaysSignificant)}`);
        await this.setStateAsync('summary.jsonSignificant', { val: JSON.stringify(this.birthdaysSignificant), ack: true });

        const keepBirthdays = [];
        const allBirthdays = (await this.getChannelsOfAsync('month'))
            .map((obj) => {
                return this.removeNamespace(obj._id);
            })
            .filter((id) => new RegExp('month.[0-9]{2}..+', 'g').test(id));

        for (const birthdayObj of this.birthdays) {
            const cleanName = this.cleanNamespace(birthdayObj.id);
            const monthPath = this.getMonthPath(birthdayObj._birthday.month() + 1) + '.' + cleanName;

            keepBirthdays.push(monthPath);

            if (!allBirthdays.includes(monthPath)) {
                this.log.debug(`birthday added: ${monthPath}`);
            }

            await this.fillPathWithBirthday(monthPath, birthdayObj);
        }

        // Delete non existent birthdays
        for (const birthdayId of allBirthdays) {
            if (!keepBirthdays.includes(birthdayId)) {
                await this.delObjectAsync(birthdayId, { recursive: true });
                this.log.debug(`[fillStates] birthday deleted: ${birthdayId}`);
            }
        }

        // next birthdays
        if (this.birthdays.length > 0) {
            const nextBirthdayDaysLeft = this.birthdays[0].daysLeft;

            await this.fillAfter('next', this.birthdays, nextBirthdayDaysLeft);

            const nextAfterBirthdaysList = this.birthdays.filter((birthday) => birthday.daysLeft > nextBirthdayDaysLeft);
            if (nextAfterBirthdaysList.length > 0) {
                const nextAfterBirthdaysLeft = nextAfterBirthdaysList[0].daysLeft;

                await this.fillAfter('nextAfter', this.birthdays, nextAfterBirthdaysLeft);
            }
        }

        // next significant birthdays
        if (this.birthdaysSignificant.length > 0) {
            const nextBirthdaySignificantDaysLeft = this.birthdaysSignificant[0].daysLeft;

            await this.fillAfter('nextSignificant', this.birthdaysSignificant, nextBirthdaySignificantDaysLeft);
        }

        // fill month json
        for (let m = 1; m <= 12; m++) {
            const monthlyBirthdays = this.birthdays.filter((birthday) => birthday._birthday.month() + 1 === m); // get all birthdays with same month
            await this.setStateAsync(`${this.getMonthPath(m)}.json`, { val: JSON.stringify(monthlyBirthdays), ack: true });
            await this.setStateChangedAsync(`${this.getMonthPath(m)}.count`, { val: monthlyBirthdays.length, ack: true });
        }
    }

    async fillAfter(path, birthdays, daysLeft) {
        this.log.debug(`[fillAfter] filling ${path} with ${daysLeft} days left`);

        const nextBirthdays = birthdays.filter((birthday) => birthday.daysLeft == daysLeft); // get all birthdays with same days left

        const nextBirthdaysText = nextBirthdays.map((birthday) => {
            return this.config.nextTextTemplate.replace('%n', birthday.name).replace('%a', birthday.age).trim();
        });

        await this.setStateAsync(`${path}.json`, { val: JSON.stringify(nextBirthdays), ack: true });
        await this.setStateChangedAsync(`${path}.daysLeft`, { val: daysLeft, ack: true });
        await this.setStateChangedAsync(`${path}.text`, { val: nextBirthdaysText.join(this.config.nextSeparator), ack: true });

        const birthdayDate = moment().set({ hour: 0, minute: 0, second: 0 }).add(daysLeft, 'days');

        await this.setStateChangedAsync(`${path}.date`, { val: birthdayDate.valueOf(), ack: true });
        await this.setStateChangedAsync(`${path}.dateFormat`, { val: this.formatDate(birthdayDate.toDate()), ack: true });
    }

    async fillPathWithBirthday(path, birthdayObj) {
        this.log.debug(`[fillPathWithBirthday] path: "${path}", birthday: ${JSON.stringify(birthdayObj)}`);

        const birthday = birthdayObj._birthday;

        await this.setObjectNotExistsAsync(path, {
            type: 'channel',
            common: {
                name: birthdayObj.id,
            },
            native: {},
        });

        await this.setObjectNotExistsAsync(`${path}.name`, {
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
                    uk: "Ім'я",
                    'zh-cn': '姓名',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateChangedAsync(`${path}.name`, { val: birthdayObj.name, ack: true });

        await this.setObjectNotExistsAsync(`${path}.age`, {
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
                    uk: 'Вік',
                    'zh-cn': '年龄',
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateChangedAsync(`${path}.age`, { val: birthdayObj.age, ack: true });

        await this.setObjectNotExistsAsync(`${path}.currentAge`, {
            type: 'state',
            common: {
                name: {
                    en: 'Current age as text',
                    de: 'Aktuelles Alter als Text',
                    ru: 'Текущий возраст как текст',
                    pt: 'Idade atual como texto',
                    nl: 'Current leeftijd als tekst',
                    fr: 'Âge actuel du texte',
                    it: 'Età attuale come testo',
                    es: 'Edad actual como texto',
                    pl: 'Aktualny wiek jako tekst',
                    uk: 'Поточний вік як текст',
                    'zh-cn': '目前的案文',
                },
                type: 'string',
                role: 'text',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateChangedAsync(`${path}.currentAge`, { val: birthdayObj.currentAgeText, ack: true });

        await this.setObjectNotExistsAsync(`${path}.day`, {
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
                    uk: 'День місяця',
                    'zh-cn': '每月的第几天',
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateChangedAsync(`${path}.day`, { val: birthday.date(), ack: true });

        await this.setObjectNotExistsAsync(`${path}.year`, {
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
                    uk: 'Рік народження',
                    'zh-cn': '出生年',
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateChangedAsync(`${path}.year`, { val: birthdayObj.birthYear, ack: true });

        await this.setObjectNotExistsAsync(`${path}.daysLeft`, {
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
                    uk: 'Днів зліва',
                    'zh-cn': '剩余天数',
                },
                type: 'number',
                role: 'value',
                read: true,
                write: false,
            },
            native: {},
        });
        await this.setStateChangedAsync(`${path}.daysLeft`, { val: birthdayObj.daysLeft, ack: true });
    }

    getMonthPath(m) {
        return 'month.' + new String(m).padStart(2, '0');
    }

    getMonthTranslation(moment, locale) {
        const momentCopy = moment.clone();
        momentCopy.locale(locale);

        return momentCopy.format('MMMM');
    }

    getCurrentAgeAsText(birthday) {
        const clonedBirthday = birthday.clone();

        const years = this.today.diff(clonedBirthday, 'year');
        clonedBirthday.add(years, 'years');

        const months = this.today.diff(clonedBirthday, 'months');
        clonedBirthday.add(months, 'months');

        const days = this.today.diff(clonedBirthday, 'days');

        return String(this.config.currentAgeTemplate).replace('%y', years).replace('%m', months).replace('%d', days);
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

    /**
     * @param {() => void} callback
     */
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
