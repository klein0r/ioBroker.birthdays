'use strict';

const path = require('path');
const { tests, IntegrationTestHarness } = require('@iobroker/testing');
const chai = require('chai');
const expect = chai.expect;

async function startAdapterAndWaitForStop(harness) {
    return new Promise(resolve => {
        harness.startAdapterAndWait()
            .then(() => {
                // Wait for adapter stop
                harness.on('stateChange', async (id, state) => {
                    if (
                        id === `system.adapter.${harness.adapterName}.0.alive` &&
                        state &&
                        state.val === false
                    ) {
                        setTimeout(() => {
                            resolve(true);
                        }, 2000);
                    }
                });
            });
    });
}

async function assertStateEquals(harness, id, value) {
    const state = await harness.states.getStateAsync(id);
    expect(state, `${id} should be an object (with value ${value})`).to.be.an('object');
    if (state) {
        expect(state.val, `${id} should have value ${value}`).to.equal(value);
    }
}

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    allowedExitCodes: [11],
    defineAdditionalTests({ suite }) {

        suite('Test Birthday calculation', getHarness => {
            /**
             * @type {IntegrationTestHarness}
             */
            let harness;
            before(async function () {
                this.timeout(60000);

                harness = getHarness();
                harness.changeAdapterConfig(harness.adapterName, {
                    native: {
                        nextTextTemplate: '%n wird %a',
                        nextSeparator: ', ',
                        icalUrl: '',
                        icalUser: '',
                        icalPassword: '',
                        icalUrlIgnoreCertErrors: false,
                        carddavUrl: '',
                        carddavUser: '',
                        carddavPassword: '',
                        carddavIgnoreCertErrors: false,
                        birthdays: [
                            {
                                name: 'John Doe',
                                day: 1,
                                month: 4,
                                year: 1955,
                            },
                            {
                                name: 'Max Mustermann',
                                day: 29,
                                month: 2,
                                year: 2000,
                            },
                            {
                                name: 'Mr. Invalid',
                                day: 32,
                                month: 1,
                                year: 1976,
                            }
                        ],
                        currentAgeTemplate: '%y Jahre, %m Monate und %d Tage',
                    }
                });

                return startAdapterAndWaitForStop(harness);
            });

            it('Check states', async function () {
                const stateJohnDoeAge = await harness.states.getStateAsync(`${harness.adapterName}.0.month.04.johnDoe.age`);
                expect(stateJohnDoeAge.val).to.be.greaterThan(60);

                await assertStateEquals(harness, `${harness.adapterName}.0.month.04.johnDoe.day`, 1);
                await assertStateEquals(harness, `${harness.adapterName}.0.month.04.johnDoe.name`, 'John Doe');
                await assertStateEquals(harness, `${harness.adapterName}.0.month.04.johnDoe.year`, 1955);

                const stateMaxMustermannAge = await harness.states.getStateAsync(`${harness.adapterName}.0.month.02.maxMustermann.age`);
                expect(stateMaxMustermannAge.val).to.be.greaterThan(20);

                await assertStateEquals(harness, `${harness.adapterName}.0.month.02.maxMustermann.day`, 29);
                await assertStateEquals(harness, `${harness.adapterName}.0.month.02.maxMustermann.name`, 'Max Mustermann');
                await assertStateEquals(harness, `${harness.adapterName}.0.month.02.maxMustermann.year`, 2000);
            });
        });
    }
});