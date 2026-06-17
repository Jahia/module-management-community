// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:

import './commands';
import addContext from 'mochawesome/addContext';
import {jsErrorsLogger} from '@jahia/cypress';

// ---------------------------------------------------------------------------
// Clean up known MUI v3 / React legacy false-positive console.error messages
// before jsErrorsLogger's "after all" hook inspects the collected issues.
// This after() runs first (registered before jsErrorsLogger.enable()) so the
// false positives are removed before jsErrorsLogger throws on them.
// ---------------------------------------------------------------------------
const MUI_V3_FALSE_POSITIVES = [
    'legacy contextTypes API',
    'Warning: React.createFactory() is deprecated'
];

after(() => {
    const issues = Cypress.env('__JS_LOGGER_FAILURES__') || [];
    const filtered = issues
        .map(item => ({
            ...item,
            errors: item.errors.filter(e =>
                !MUI_V3_FALSE_POSITIVES.some(fp => e.msg.includes(fp))
            )
        }))
        .filter(item => item.errors.length > 0);
    Cypress.env('__JS_LOGGER_FAILURES__', filtered);
});

// Enable and attach JS Errors Logger
jsErrorsLogger.enable();
// Define allowed JS warnings to ignore them in the logs
jsErrorsLogger.setAllowedJsWarnings([
    'Unsatisfied version',
    'No satisfying version',
    // React.createFactory() is deprecated — emitted by older third-party libs still bundled in Jahia
    'React.createFactory()',
    // MUI/legacy React warnings that originate from Jahia platform dependencies
    'Warning: findDOMNode is deprecated',
    'Warning: componentWillMount',
    'Warning: componentWillReceiveProps',
    'Warning: componentWillUpdate',
    // MUI v3 uses legacy React context (contextTypes / childContextTypes) — known false positives
    'legacy contextTypes API',
    'childContextTypes API',
    // graphql-tag duplicate fragment name warnings from other Jahia modules loaded on the page
    'fragment with name',
    // Moonstone Typography (<p>) nested inside another <p> — cosmetic warning from Jahia platform
    'validateDOMNesting'
]);

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('cypress-terminal-report/src/installLogsCollector')();
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('@jahia/cypress/dist/support/registerSupport').registerSupport();

Cypress.on('uncaught:exception', () => {
    // Returning false here prevents Cypress from
    // failing the test
    return false;
});
if (Cypress.browser.family === 'chromium') {
    Cypress.automation('remote:debugger:protocol', {
        command: 'Network.enable',
        params: {}
    });
    Cypress.automation('remote:debugger:protocol', {
        command: 'Network.setCacheDisabled',
        params: {cacheDisabled: true}
    });
}

Cypress.on('test:after:run', (test, runnable) => {
    let videoName = Cypress.spec.relative;
    videoName = videoName.replace('/.cy.*', '').replace('cypress/e2e/', '');
    const videoUrl = 'videos/' + videoName + '.mp4';
    addContext({test}, videoUrl);
    if (test.state === 'failed') {
        const screenshot = `screenshots/${Cypress.spec.relative.replace('cypress/e2e/', '')}/${runnable.parent.title} -- ${test.title} (failed).png`;
        addContext({test}, screenshot);
    }
});
