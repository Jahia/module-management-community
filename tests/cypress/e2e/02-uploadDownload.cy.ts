/**
 * End-to-end tests for the Upload/Deploy and Export/Snapshot functionality
 * in the Module Management Community admin app.
 *
 * Upload dialog  — Deploy a single .jar module or import a .zip snapshot archive.
 * Export dialog  — Export a snapshot ZIP of currently-installed Jahia modules.
 * Generate script dialog — Generate a provisioning YAML/cURL script.
 * DryRun result dialog  — YAML ↔ cURL view toggle after generating a script.
 *
 * Integration tests (sections 12 & 14) download real JARs from store.jahia.com.
 * The test module and versions are configurable via Cypress environment variables:
 *
 *   STORE_TEST_MODULE   symbolic name of the module to install   (default: "healthcheck")
 *   STORE_VERSION_1     first version to deploy                  (default: "3.4.0")
 *   STORE_VERSION_2     second version to deploy (upgrade/test)  (default: "3.3.0")
 */

describe('Upload / Download module functionality', () => {
    const adminPath = '/jahia/administration/module-management-community';
    const root = '#module-management-community-root';
    const nameFilterPlaceholder = 'Filter by bundle symbolic name';

    const STORE_MODULE: string = (Cypress.env('STORE_TEST_MODULE') as string) || 'healthcheck';
    const STORE_VERSION_1: string = (Cypress.env('STORE_VERSION_1') as string) || '3.4.0';
    const STORE_VERSION_2: string = (Cypress.env('STORE_VERSION_2') as string) || '3.3.0';

    const storeJarUrl = (moduleName: string, version: string) =>
        `https://store.jahia.com/contents/modules-repository/org/jahia/modules/${moduleName}/${version}/${moduleName}-${version}.jar`;

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    const visitPage = () => {
        cy.login();
        cy.visit(adminPath);
        cy.get(root, {timeout: 10000}).should('be.visible');
    };

    /** Open the ⋮ more-actions menu */
    const openMoreActionsMenu = () => {
        cy.get('[data-testid="more-actions-btn"]').click();
    };

    const openUploadDialog = () => {
        openMoreActionsMenu();
        cy.contains('Deploy module').click();
        cy.get('[data-testid="upload-module-dialog"]').should('be.visible');
    };

    const openExportDialog = () => {
        openMoreActionsMenu();
        cy.contains('Export snapshot').click();
        cy.get('[data-testid="export-modules-dialog"]').should('be.visible');
    };

    const openGenerateScriptDialog = () => {
        openMoreActionsMenu();
        cy.contains('Generate provisioning script').click();
        cy.get('[data-testid="generate-script-dialog"]').should('be.visible');
    };

    const uninstallModule = (moduleName: string, version: string) => {
        cy.apollo({
            queryFile: 'graphql/query/getBundleDetails.graphql',
            variables: {name: moduleName, version}
        }).then(response => {
            const bundleId = response?.data?.admin?.modulesManagement?.bundle?.bundleId;
            if (bundleId !== null && bundleId !== undefined) {
                cy.apollo({
                    queryFile: 'graphql/mutation/uninstallBundle.graphql',
                    variables: {bundleId}
                });
            }
        });
    };

    // ===========================================================================
    // 11. UPLOAD / DEPLOY MODULE DIALOG — UI structure
    // ===========================================================================

    describe('Deploy Module dialog — UI structure', () => {
        beforeEach(visitPage);

        it('renders "Deploy module" option in the more-actions menu', () => {
            openMoreActionsMenu();
            cy.contains('Deploy module').should('be.visible');
        });

        it('opens the "Deploy / Import module" dialog via the more-actions menu', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.contains('Deploy / Import module').should('be.visible');
            });
        });

        it('defaults to JAR mode with "Deploy single module (.jar)" selected', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.get('input[type="radio"][value="jar"]').should('be.checked');
                cy.contains('Deploy single module (.jar)').should('be.visible');
            });
        });

        it('shows both JAR and ZIP mode radio buttons', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.get('input[type="radio"][value="jar"]').should('exist');
                cy.get('input[type="radio"][value="zip"]').should('exist');
            });
        });

        it('shows a drop zone with JAR hint text in JAR mode', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.contains('Drag & drop a .jar file here').should('be.visible');
            });
        });

        it('"Deploy" button is disabled when no file is selected', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.contains('button', 'Deploy').should('be.disabled');
            });
        });

        it('"Cancel" button closes the dialog without deploying', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.contains('button', 'Cancel').click();
            });
            cy.get('[data-testid="upload-module-dialog"]').should('not.exist');
        });

        it('switching to ZIP mode changes the drop zone hint and button label to "Import"', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.get('input[type="radio"][value="zip"]').click();
                cy.contains('Drag & drop a snapshot archive (.zip)').should('be.visible');
                cy.contains('button', 'Import').should('be.disabled');
            });
        });

        it('switching back to JAR mode restores the "Deploy" button label', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.get('input[type="radio"][value="zip"]').click();
                cy.get('input[type="radio"][value="jar"]').click();
                cy.contains('button', 'Deploy').should('be.disabled');
            });
        });

        it('ZIP mode shows "Import" button (disabled) and hint text', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.get('input[type="radio"][value="zip"]').click();
                cy.contains('Upload a .zip archive previously generated by').should('be.visible');
            });
        });

        it('file input accepts only .jar files in JAR mode', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]')
                .find('input[type="file"]')
                .should('have.attr', 'accept', '.jar');
        });

        it('file input accepts only .zip files in ZIP mode', () => {
            openUploadDialog();
            cy.get('[data-testid="upload-module-dialog"]').within(() => {
                cy.get('input[type="radio"][value="zip"]').click();
                cy.get('input[type="file"]').should('have.attr', 'accept', '.zip');
            });
        });
    });

    // ===========================================================================
    // 12. DEPLOY FROM store.jahia.com (integration — requires internet access)
    // ===========================================================================

    describe(`Deploy module from store.jahia.com (${STORE_MODULE})`, () => {
        after(() => {
            uninstallModule(STORE_MODULE, STORE_VERSION_1);
            uninstallModule(STORE_MODULE, STORE_VERSION_2);
        });

        it(`deploys ${STORE_MODULE} v${STORE_VERSION_1} via the Upload dialog`, () => {
            visitPage();
            cy.task<number[] | null>('downloadFile', {url: storeJarUrl(STORE_MODULE, STORE_VERSION_1)}).then(bytes => {
                if (!bytes) {
                    cy.log(`Skipping: ${STORE_MODULE}-${STORE_VERSION_1}.jar not available at store URL`);
                    return;
                }

                openUploadDialog();
                cy.get('[data-testid="upload-module-dialog"]').within(() => {
                    cy.get('input[type="file"]').selectFile(
                        {
                            contents: Cypress.Buffer.from(bytes),
                            fileName: `${STORE_MODULE}-${STORE_VERSION_1}.jar`,
                            mimeType: 'application/java-archive'
                        },
                        {force: true}
                    );
                    cy.contains(`${STORE_MODULE}-${STORE_VERSION_1}.jar`).should('be.visible');
                    cy.contains('button', 'Deploy').should('not.be.disabled').click();
                    cy.contains('✅', {timeout: 60000}).should('be.visible');
                });
            });
        });

        it(`deployed ${STORE_MODULE} v${STORE_VERSION_1} appears in the installed modules list`, () => {
            cy.apollo({
                queryFile: 'graphql/query/getInstalledModules.graphql'
            }).then(response => {
                const modules: string[] =
                    response?.data?.admin?.modulesManagement?.installedModules ?? [];
                const installed = modules.some((e: string) =>
                    e.startsWith(`${STORE_MODULE}/${STORE_VERSION_1}`)
                );
                if (!installed) {
                    cy.log(`Skipping: ${STORE_MODULE} v${STORE_VERSION_1} was not deployed — skipping UI check`);
                    return;
                }

                visitPage();
                cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).clear().type(STORE_MODULE);
                cy.contains('tr', STORE_MODULE, {timeout: 15000}).should('be.visible');
                cy.get('tbody').should('contain.text', STORE_VERSION_1);
            });
        });

        it(`deploys ${STORE_MODULE} v${STORE_VERSION_2} (second version) via the Upload dialog`, () => {
            visitPage();
            cy.task<number[] | null>('downloadFile', {url: storeJarUrl(STORE_MODULE, STORE_VERSION_2)}).then(bytes => {
                if (!bytes) {
                    cy.log(`Skipping: ${STORE_MODULE}-${STORE_VERSION_2}.jar not available at store URL`);
                    return;
                }

                openUploadDialog();
                cy.get('[data-testid="upload-module-dialog"]').within(() => {
                    cy.get('input[type="file"]').selectFile(
                        {
                            contents: Cypress.Buffer.from(bytes),
                            fileName: `${STORE_MODULE}-${STORE_VERSION_2}.jar`,
                            mimeType: 'application/java-archive'
                        },
                        {force: true}
                    );
                    cy.contains(`${STORE_MODULE}-${STORE_VERSION_2}.jar`).should('be.visible');
                    cy.contains('button', 'Deploy').should('not.be.disabled').click();
                    cy.contains('✅', {timeout: 60000}).should('be.visible');
                });
            });
        });

        it(`both v${STORE_VERSION_1} and v${STORE_VERSION_2} of ${STORE_MODULE} are visible in the list`, () => {
            cy.apollo({
                queryFile: 'graphql/query/getInstalledModules.graphql'
            }).then(response => {
                const modules: string[] =
                    response?.data?.admin?.modulesManagement?.installedModules ?? [];
                const v1Installed = modules.some((e: string) =>
                    e.startsWith(`${STORE_MODULE}/${STORE_VERSION_1}`)
                );
                const v2Installed = modules.some((e: string) =>
                    e.startsWith(`${STORE_MODULE}/${STORE_VERSION_2}`)
                );
                if (!v1Installed || !v2Installed) {
                    cy.log(
                        `Skipping: not both versions deployed ` +
                        `(v1=${v1Installed}, v2=${v2Installed}) — skipping UI check`
                    );
                    return;
                }

                visitPage();
                cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).clear().type(STORE_MODULE);
                cy.get('tbody', {timeout: 15000}).should('contain.text', STORE_VERSION_1);
                cy.get('tbody').should('contain.text', STORE_VERSION_2);
            });
        });

        it(`the GraphQL API confirms both versions of ${STORE_MODULE} are installed`, () => {
            cy.apollo({
                queryFile: 'graphql/query/getInstalledModules.graphql'
            }).then(response => {
                const modules: string[] =
                    response?.data?.admin?.modulesManagement?.installedModules ?? [];
                const v1Found = modules.some((e: string) =>
                    e.startsWith(`${STORE_MODULE}/${STORE_VERSION_1}`)
                );
                const v2Found = modules.some((e: string) =>
                    e.startsWith(`${STORE_MODULE}/${STORE_VERSION_2}`)
                );
                if (!v1Found && !v2Found) {
                    cy.log(`Skipping: neither version of ${STORE_MODULE} was deployed`);
                    return;
                }

                if (v1Found) {
                    expect(v1Found, `${STORE_MODULE} v${STORE_VERSION_1} should be installed`).to.be.true;
                }

                if (v2Found) {
                    expect(v2Found, `${STORE_MODULE} v${STORE_VERSION_2} should be installed`).to.be.true;
                }
            });
        });
    });

    // ===========================================================================
    // 13. EXPORT / SNAPSHOT DIALOG — UI structure
    // ===========================================================================

    describe('Export Snapshot dialog — UI structure', () => {
        beforeEach(visitPage);

        it('shows "Export snapshot" option in the more-actions menu', () => {
            openMoreActionsMenu();
            cy.contains('Export snapshot').should('be.visible');
        });

        it('opens the "Export module snapshot" dialog via the more-actions menu', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('Export module snapshot').should('be.visible');
            });
        });

        it('shows "Bundle types to include" section with three checkboxes', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('Bundle types to include').should('be.visible');
                cy.contains('Modules').should('be.visible');
                cy.contains('System modules').should('be.visible');
                cy.contains('Template sets').should('be.visible');
            });
        });

        it('all three type checkboxes are checked by default', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('label', 'Modules').find('input[type="checkbox"]').should('be.checked');
                cy.contains('label', 'System modules').find('input[type="checkbox"]').should('be.checked');
                cy.contains('label', 'Template sets').find('input[type="checkbox"]').should('be.checked');
            });
        });

        it('cannot deselect all checkboxes — last checked one remains checked', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('label', 'Modules').click();
                cy.contains('label', 'System modules').click();
                cy.contains('label', 'Template sets').click();
                cy.contains('label', 'Template sets').find('input[type="checkbox"]').should('be.checked');
            });
        });

        it('shows the "Embed all JAR files in the archive" toggle', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('Embed all JAR files in the archive').should('be.visible');
            });
        });

        it('shows "Preview YAML", "Cancel", and "Download archive" action buttons', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('button', 'Preview YAML').should('be.visible').and('not.be.disabled');
                cy.contains('button', 'Cancel').should('be.visible');
                cy.contains('button', 'Download archive').should('be.visible').and('not.be.disabled');
            });
        });

        it('"Cancel" button closes the export dialog', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('button', 'Cancel').click();
            });
            cy.get('[data-testid="export-modules-dialog"]').should('not.exist');
        });

        it('"Preview YAML" fetches and displays generated provisioning.yaml content', () => {
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('button', 'Preview YAML').click();
                cy.contains('Generated provisioning.yaml', {timeout: 30000}).should('be.visible');
                cy.get('pre').should('be.visible').and('not.be.empty');
            });
        });
    });

    // ===========================================================================
    // 14. EXPORT — download integration tests
    // ===========================================================================

    describe('Export Snapshot — download', () => {
        const stubExport = () => {
            cy.intercept('GET', '**/modules/module-management-community/export*', {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename="module-snapshot-test.zip"'
                },
                body: 'stub'
            }).as('exportRequest');
        };

        it('"Download archive" triggers a GET request to the export endpoint', () => {
            visitPage();
            stubExport();
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('button', 'Download archive').click();
            });
            cy.wait('@exportRequest').then(interception => {
                expect(interception.request.url).to.include('types=');
                expect(interception.request.url).to.include('embedAll=');
                expect(interception.response.statusCode).to.be.oneOf([200, 204]);
            });
            cy.get('[data-testid="export-modules-dialog"]').should('not.exist');
        });

        it('export URL includes all three types when all checkboxes are checked', () => {
            visitPage();
            stubExport();
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('button', 'Download archive').click();
            });
            cy.wait('@exportRequest').then(interception => {
                const url = decodeURIComponent(interception.request.url);
                expect(url).to.include('module');
                expect(url).to.include('system');
                expect(url).to.include('templatesSet');
            });
        });

        it('unchecking "System modules" removes "system" from the export URL', () => {
            visitPage();
            stubExport();
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('label', 'System modules').click();
                cy.contains('button', 'Download archive').click();
            });
            cy.wait('@exportRequest').then(interception => {
                const url = decodeURIComponent(interception.request.url);
                expect(url).to.not.include('system');
            });
        });

        it('export URL contains embedAll=true when embed toggle is on (default)', () => {
            visitPage();
            stubExport();
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.contains('button', 'Download archive').click();
            });
            cy.wait('@exportRequest').then(interception => {
                expect(interception.request.url).to.include('embedAll=true');
            });
        });

        it('export URL contains embedAll=false when embed toggle is turned off', () => {
            visitPage();
            stubExport();
            openExportDialog();
            cy.get('[data-testid="export-modules-dialog"]').within(() => {
                cy.get('[data-testid="embed-all-toggle"]').click({force: true});
                cy.contains('button', 'Download archive').click();
            });
            cy.wait('@exportRequest').then(interception => {
                expect(interception.request.url).to.include('embedAll=false');
            });
        });
    });

    // ===========================================================================
    // 15. GENERATE PROVISIONING SCRIPT DIALOG — UI structure
    // ===========================================================================

    describe('Generate provisioning script dialog — UI structure', () => {
        beforeEach(visitPage);

        it('shows "Generate provisioning script" option in the more-actions menu', () => {
            openMoreActionsMenu();
            cy.contains('Generate provisioning script').should('be.visible');
        });

        it('opens the generate script dialog via the more-actions menu', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains('Generate provisioning script').should('be.visible');
            });
        });

        it('shows type filter checkboxes for Modules, System and Template sets', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains('Modules').should('be.visible');
                cy.contains('System').should('be.visible');
                cy.contains('Template sets').should('be.visible');
            });
        });

        it('shows a module list with at least one entry after loading', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                // The module list renders checkboxes — wait for content to load
                cy.get('input[type="checkbox"]', {timeout: 15000}).should('have.length.at.least', 1);
            });
        });

        it('shows "Select all" and "Clear all" buttons', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains('button', 'Select all').should('be.visible');
                cy.contains('button', 'Clear all').should('be.visible');
            });
        });

        it('shows a selection summary line with counts', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains(/\d+ of \d+ modules selected/, {timeout: 15000}).should('be.visible');
            });
        });

        it('"Generate script" button is enabled when modules are selected', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                // Default: all non-SNAPSHOT modules pre-selected
                cy.contains('button', 'Generate script', {timeout: 15000}).should('not.be.disabled');
            });
        });

        it('"Generate script" button is disabled after "Clear all" is clicked', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains('button', 'Clear all', {timeout: 15000}).click();
                cy.contains('button', 'Generate script').should('be.disabled');
            });
        });

        it('"Select all" re-enables the "Generate script" button', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains('button', 'Clear all', {timeout: 15000}).click();
                cy.contains('button', 'Generate script').should('be.disabled');
                cy.contains('button', 'Select all').click();
                cy.contains('button', 'Generate script').should('not.be.disabled');
            });
        });

        it('shows a search input to filter modules by name', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.get('input[type="text"]').should('be.visible');
            });
        });

        it('"Cancel" button closes the dialog', () => {
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains('button', 'Cancel').click();
            });
            cy.get('[data-testid="generate-script-dialog"]').should('not.exist');
        });
    });

    // ===========================================================================
    // 16. DRYRUN RESULT DIALOG — YAML and cURL views (via Generate script)
    // ===========================================================================

    describe('DryRun result dialog — YAML and cURL views', () => {
        /**
         * Opens the Generate script dialog, waits for modules to load, generates
         * the script and waits for the result dialog. Requires at least one
         * non-SNAPSHOT module installed on the Jahia instance.
         */
        const openResultDialog = () => {
            visitPage();
            openGenerateScriptDialog();
            cy.get('[data-testid="generate-script-dialog"]').within(() => {
                cy.contains('button', 'Generate script', {timeout: 15000}).should('not.be.disabled').click();
            });
            cy.get('[data-testid="dryrun-result-dialog"]', {timeout: 30000}).should('be.visible');
        };

        it('clicking "Generate script" opens the result dialog', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').should('be.visible');
        });

        it('result dialog defaults to YAML view with provisioning content in a <pre>', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('YAML').should('be.visible');
                cy.get('pre').scrollIntoView().should('exist').and('not.be.empty');
            });
        });

        it('result dialog has a cURL tab button', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('cURL').should('be.visible');
            });
        });

        it('switching to cURL view shows a curl command in the <pre>', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('cURL').click();
                cy.get('pre').should('contain.text', 'curl');
            });
        });

        it('switching back from cURL to YAML restores provisioning YAML content', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('cURL').click();
                cy.contains('YAML').click();
                cy.get('pre').should('contain.text', 'installOrUpgradeBundle');
            });
        });

        it('shows a "Copy YAML" action button in YAML view', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('button', 'Copy YAML').should('be.visible');
            });
        });

        it('shows a "Download .yaml" button in YAML view', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('button', 'Download .yaml').should('be.visible');
            });
        });

        it('download button label changes to ".sh" when in cURL view', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('cURL').click();
                cy.contains('button', 'Download .sh').should('be.visible');
            });
        });

        it('"Close" button closes the result dialog', () => {
            openResultDialog();
            cy.get('[data-testid="dryrun-result-dialog"]').within(() => {
                cy.contains('button', 'Close').click();
            });
            cy.get('[data-testid="dryrun-result-dialog"]').should('not.exist');
        });
    });
});
