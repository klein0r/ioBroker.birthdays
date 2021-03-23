![Logo](admin/birthdays.png)

# ioBroker.birthdays

[![NPM version](http://img.shields.io/npm/v/iobroker.birthdays.svg)](https://www.npmjs.com/package/iobroker.birthdays)
[![Downloads](https://img.shields.io/npm/dm/iobroker.birthdays.svg)](https://www.npmjs.com/package/iobroker.birthdays)
[![Stable](http://iobroker.live/badges/birthdays-stable.svg)](http://iobroker.live/badges/birthdays-stable.svg)
[![installed](http://iobroker.live/badges/birthdays-installed.svg)](http://iobroker.live/badges/birthdays-installed.svg)
[![Dependency Status](https://img.shields.io/david/klein0r/iobroker.birthdays.svg)](https://david-dm.org/klein0r/iobroker.birthdays)
[![Known Vulnerabilities](https://snyk.io/test/github/klein0r/ioBroker.birthdays/badge.svg)](https://snyk.io/test/github/klein0r/ioBroker.birthdays)
[![Build Status](http://img.shields.io/travis/klein0r/ioBroker.birthdays.svg)](https://travis-ci.org/klein0r/ioBroker.birthdays)

[![NPM](https://nodei.co/npm/iobroker.birthdays.png?downloads=true)](https://nodei.co/npm/iobroker.birthdays/)

## birthdays adapter for ioBroker

Use an ical file to import your contacts birthdays or define the birthday dates directly in the adapter settings

## Configuration

You can use an ical url to provide access to your birthday calendar. The adapter will search for all events within that file.

Your events

1. must contain the birth year in the description (e.g. 1987)
2. are full day events
3. have to be "repeated yearly"

It is NOT required to use the ical option. You can also define all birthday dates in the settings. *When you use both options, the information will be merged.*

## Changelog

### 0.0.3

* (klein0r) Added next and nextAfter birthdays

### 0.0.2

* (klein0r) Added more objects and states

### 0.0.1

* (klein0r) initial release

## Credits

[Logo by herbanu](https://pixabay.com/de/vectors/geburtstag-karte-cele-feier-design-3148707/)

## License

The MIT License (MIT)

Copyright (c) 2021 Matthias Kleine <info@haus-automatisierung.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
