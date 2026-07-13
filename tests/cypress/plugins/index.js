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
    /**
     * Minimal STORED (uncompressed) ZIP writer — no third-party dependency. Used to build the
     * test JAR (a ZIP with META-INF/MANIFEST.MF) and the malicious archives (karafCommand /
     * zip-slip) consumed by the authorization + import-hardening specs.
     * @param {{name: string, content: string|Buffer}[]} entries
     * @returns {Buffer}
     */
    const buildZipBytes = entries => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const zlib = require('zlib');
        const local = [];
        const central = [];
        let offset = 0;
        for (const {name, content} of entries) {
            const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
            const nameBuf = Buffer.from(name, 'utf8');
            const crc = zlib.crc32(data) >>> 0;
            const lfh = Buffer.alloc(30);
            lfh.writeUInt32LE(0x04034b50, 0);
            lfh.writeUInt16LE(20, 4);
            lfh.writeUInt32LE(crc, 14);
            lfh.writeUInt32LE(data.length, 18);
            lfh.writeUInt32LE(data.length, 22);
            lfh.writeUInt16LE(nameBuf.length, 26);
            local.push(lfh, nameBuf, data);
            const cdh = Buffer.alloc(46);
            cdh.writeUInt32LE(0x02014b50, 0);
            cdh.writeUInt16LE(20, 4);
            cdh.writeUInt16LE(20, 6);
            cdh.writeUInt32LE(crc, 16);
            cdh.writeUInt32LE(data.length, 20);
            cdh.writeUInt32LE(data.length, 24);
            cdh.writeUInt16LE(nameBuf.length, 28);
            cdh.writeUInt32LE(offset, 42);
            central.push(cdh, nameBuf);
            offset += lfh.length + nameBuf.length + data.length;
        }
        const centralBuf = Buffer.concat(central);
        const eocd = Buffer.alloc(22);
        eocd.writeUInt32LE(0x06054b50, 0);
        eocd.writeUInt16LE(entries.length, 8);
        eocd.writeUInt16LE(entries.length, 10);
        eocd.writeUInt32LE(centralBuf.length, 12);
        eocd.writeUInt32LE(offset, 16);
        return Buffer.concat([...local, centralBuf, eocd]);
    };

    on('task', {
        /** Build a minimal valid OSGi bundle JAR → number[] (JSON-serialisable). */
        buildTestJar: ({symbolicName = 'org.example.mmctest', version = '1.0.0'}) => {
            const manifest =
                'Manifest-Version: 1.0\r\n' +
                'Bundle-ManifestVersion: 2\r\n' +
                `Bundle-SymbolicName: ${symbolicName}\r\n` +
                `Bundle-Version: ${version}\r\n\r\n`;
            const bytes = buildZipBytes([
                {name: 'META-INF/MANIFEST.MF', content: manifest},
                {name: 'readme.txt', content: 'test bundle'}
            ]);
            return Array.from(bytes);
        },
        /** Build a snapshot ZIP whose provisioning.yaml contains a karafCommand (S74). */
        buildKarafCommandZip: () => {
            const yaml =
                '- installBundle:\n' +
                "  - url: 'https://store.jahia.com/mod.jar'\n" +
                '- karafCommand: "log:log \'S74 MUST NOT RUN\'"\n';
            return Array.from(buildZipBytes([{name: 'provisioning.yaml', content: yaml}]));
        },
        /** Build a ZIP carrying a zip-slip entry and a disallowed .sh entry (S75). */
        buildZipSlipZip: () => {
            return Array.from(buildZipBytes([
                {name: '../../evil.jar', content: 'payload'},
                {name: 'payload.sh', content: '#!/bin/sh\necho pwned'},
                {name: 'provisioning.yaml', content: '- karafCommand: "noop"\n'}
            ]));
        },
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
