/// <reference types="cypress" />
// ***********************************************************
// This example plugins/index.js can be used to load plugins
//
// You can change the location of this file or turn off loading
// the plugins file with the 'pluginsFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

/**
 * @type {Cypress.PluginConfig}
 */
module.exports = (on, config) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('cypress-terminal-report/src/installLogsPrinter')(on);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@jahia/cypress/dist/plugins/registerPlugins').registerPlugins(on, config);

    /**
     * Download a remote file and return its bytes as a plain number array so
     * that Cypress can JSON-serialize it across the plugin/browser boundary.
     * Usage in tests: cy.task('downloadFile', { url }) → number[]
     */
    on('task', {
        downloadFile: ({url}) => {
            return new Promise((resolve, reject) => {
                const download = targetUrl => {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const lib = targetUrl.startsWith('https') ? require('https') : require('http');
                    lib.get(targetUrl, resp => {
                        // Follow redirects
                        if ([301, 302, 303, 307, 308].includes(resp.statusCode) && resp.headers.location) {
                            download(resp.headers.location);
                            return;
                        }

                        if (resp.statusCode < 200 || resp.statusCode >= 300) {
                            // Return null instead of rejecting so tests can skip gracefully
                            // when the requested module version isn't available on the store
                            resolve(null);
                            return;
                        }

                        const chunks = [];
                        resp.on('data', chunk => chunks.push(chunk));
                        resp.on('end', () => resolve(Array.from(Buffer.concat(chunks))));
                        resp.on('error', reject);
                    }).on('error', reject);
                };

                download(url);
            });
        }
    });

    return config;
};
