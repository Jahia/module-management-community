import { defineConfig } from 'cypress'
import * as fs from 'node:fs'
import * as dotenv from 'dotenv'

dotenv.config()

const jahiaUrl = process.env.JAHIA_URL || 'http://localhost:8080'

export default defineConfig({
    // DefaultCommandTimeout: 10000,
    // videoUploadOnPasses: false,
    // Retry failed tests in CI (headless) to absorb transient flakiness such as
    // asynchronous Mermaid/ELK graph rendering; no retries in interactive mode.
    retries: {
        runMode: 2,
        openMode: 0,
    },
    reporter: 'cypress-multi-reporters',
    reporterOptions: {
        configFile: 'reporter-config.json',
    },
    screenshotsFolder: './results/screenshots',
    video: true, // In Cypress, videos are disabled by default
    videosFolder: './results/videos',
    viewportWidth: 1366,
    viewportHeight: 768,
    watchForFileChanges: false,
    e2e: {
        // We've imported your old cypress plugins here.
        // You may want to clean this up later by importing these.
        setupNodeEvents(on, config) {
            // Delete videos for tests that did not fail
            on('after:spec', (spec: Cypress.Spec, results: CypressCommandLine.RunResult) => {
                if (results && results.video) {
                    // Do we have failures for any retry attempts?
                    const failures = results.tests.some((test) =>
                        test.attempts.some((attempt) => attempt.state === 'failed'),
                    )
                    if (!failures) {
                        // Delete the video if the spec passed and no tests retried
                        fs.unlinkSync(results.video)
                    }
                }
            })
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('./cypress/plugins/index.js')(on, config)
        },
        excludeSpecPattern: '*.ignore.ts',
        baseUrl: jahiaUrl,
    },
    env: {
        SUPER_USER_PASSWORD: process.env.SUPER_USER_PASSWORD || 'root1234',
        JAHIA_URL: jahiaUrl,
        // Module used for store.jahia.com deployment integration tests
        STORE_TEST_MODULE: process.env.STORE_TEST_MODULE || 'healthcheck',
        STORE_VERSION_1: process.env.STORE_VERSION_1 || '3.4.0',
        STORE_VERSION_2: process.env.STORE_VERSION_2 || '3.3.0',
    },
})
