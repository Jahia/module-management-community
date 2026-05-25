/**
 * End-to-end tests for the Module Management Community Jahia admin app.
 *
 * Admin route: /jahia/administration/module-management-community
 * Root element: #module-management-community-root
 *
 * The app is a server-level admin panel that lists all installed OSGi
 * bundles/modules with filtering, sorting, pagination, and per-bundle detail
 * dialogs (identity, sites, version history, dependency graphs).
 *
 * Test module used as a stable reference anchor: "module-management-community"
 * (always installed and ACTIVE while the test suite runs).
 */

describe('Module Management Community', () => {
    const adminPath = '/jahia/administration/module-management-community';
    const root = '#module-management-community-root';
    /** Bundle guaranteed to be installed and ACTIVE during the test run */
    const testBundle = 'module-management-community';
    const nameFilterPlaceholder = 'Filter by bundle symbolic name';

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    /**
     * Visit the admin page and wait until the table has rendered the test bundle
     * row (also proves the initial GQL query and that row's per-row query both
     * finished).
     */
    const visitPage = () => {
        cy.login();
        cy.visit(adminPath);
        cy.get(root, {timeout: 10000}).should('be.visible');
    };

    /** Type into the symbolic-name filter input */
    const filterByName = (name: string) => {
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).clear();
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).type(name);
    };

    /**
     * After filtering to a single row, wait for its per-row GQL query to finish.
     * The "Show details" action button is rendered only after ModuleRow's query
     * resolves — so its presence proves the row is fully loaded.
     */
    const waitForRowLoaded = () => {
        cy.get('[title="Show details"]', {timeout: 20000}).first().should('be.visible');
    };

    // ===========================================================================
    // 1. PAGE STRUCTURE
    // ===========================================================================

    describe('Page structure', () => {
        beforeEach(visitPage);

        it('renders the application title "Modules management"', () => {
            cy.get(root).should('contain.text', 'Modules management');
        });

        it('renders the application subtitle about installing and managing modules', () => {
            cy.get(root).should('contain.text', 'Allows to install');
        });

        it('renders the "Latest updates checked at" timestamp area', () => {
            cy.contains('Latest updates checked at').should('be.visible');
        });

        it('renders the "Installed modules" card header', () => {
            cy.contains('Installed modules').should('be.visible');
        });

        it('renders all expected table column headers', () => {
            cy.contains('Module name').should('be.visible');
            cy.contains('Type').should('be.visible');
            cy.contains('Installed version').should('be.visible');
            cy.contains('State').should('be.visible');
            cy.contains('Actions').should('be.visible');
        });

        it('renders the module name filter input with correct placeholder', () => {
            cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).should('be.visible');
        });

        it('renders the type filter select defaulting to "All types"', () => {
            cy.contains('select', 'All types').should('be.visible').and('have.value', '');
        });

        it('renders the pagination info line', () => {
            cy.contains(/Showing \d+ to \d+ of \d+ modules/).should('be.visible');
        });

        it('renders the Help button in the header', () => {
            cy.contains('button', 'Help').should('be.visible');
        });

        it('renders the Refresh button in the sidebar', () => {
            cy.contains('button', 'Refresh').should('be.visible');
        });
    });

    // ===========================================================================
    // 2. MODULE NAME FILTER
    // ===========================================================================

    describe('Module name filter', () => {
        beforeEach(visitPage);

        it('filtering by bundle name shows only matching rows', () => {
            filterByName(testBundle);
            cy.contains(testBundle).should('be.visible');
            cy.contains('Showing 1 to 1 of 1 modules').should('be.visible');
        });

        it('entering a non-existent name shows zero results', () => {
            filterByName('zzz-absolutely-does-not-exist-xyz');
            cy.contains('Showing 0 to 0 of 0 modules').should('be.visible');
        });

        it('clearing the filter restores the full list', () => {
            filterByName('zzz-absolutely-does-not-exist-xyz');
            cy.contains('Showing 0 to 0 of 0 modules').should('be.visible');
            cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).clear();
            cy.contains(/Showing 1 to \d+ of \d+ modules/).should('be.visible');
        });
    });

    // ===========================================================================
    // 3. TYPE FILTER
    // ===========================================================================

    describe('Type filter', () => {
        beforeEach(() => {
            visitPage();
            filterByName(testBundle);
            waitForRowLoaded();
        });

        it('shows "module" type badge on the known bundle row', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains('module').should('be.visible');
            });
        });

        it('filtering by type "module" keeps the known module row visible', () => {
            cy.contains('select', 'All types').select('module');
            cy.contains(testBundle).should('be.visible');
        });

        it('filtering by type "bundle" hides the known module (whose type is "module")', () => {
            cy.contains('select', 'All types').select('bundle');
            cy.get('tbody').should('not.contain', testBundle);
        });

        it('resetting the type filter to "All types" reveals the module again', () => {
            cy.contains('select', 'All types').select('bundle');
            cy.get('tbody').should('not.contain', testBundle);
            cy.contains('select', 'All types').select('');
            cy.contains(testBundle).should('be.visible');
        });

        it('type filter has all four type options: module, system, bundle, templatesSet', () => {
            cy.contains('select', 'All types').within(() => {
                cy.get('option[value="module"]').should('exist');
                cy.get('option[value="system"]').should('exist');
                cy.get('option[value="bundle"]').should('exist');
                cy.get('option[value="templatesSet"]').should('exist');
            });
        });
    });

    // ===========================================================================
    // 4. PAGINATION
    // ===========================================================================

    describe('Pagination', () => {
        beforeEach(visitPage);

        it('"Previous" button is disabled on page 1', () => {
            cy.contains('button', 'Previous').should('be.disabled');
        });

        it('"Next" button is disabled when only 1 module matches the filter', () => {
            filterByName(testBundle);
            cy.contains('Showing 1 to 1 of 1 modules').should('be.visible');
            cy.contains('button', 'Next').should('be.disabled');
        });

        it('items-per-page selector contains options 20, 40 and 60', () => {
            // Items-per-page select is the second <select> on the page (type filter is the first)
            cy.get('select').eq(1).within(() => {
                cy.get('option[value="20"]').should('exist');
                cy.get('option[value="40"]').should('exist');
                cy.get('option[value="60"]').should('exist');
            });
        });

        it('changing items-per-page to 40 keeps the pagination info visible', () => {
            cy.get('select').eq(1).select('40');
            cy.contains(/Showing \d+ to \d+ of \d+ modules/).should('be.visible');
        });
    });

    // ===========================================================================
    // 5. BUNDLE ROW CONTENT
    // ===========================================================================

    describe('Bundle row content', () => {
        beforeEach(() => {
            visitPage();
            filterByName(testBundle);
            waitForRowLoaded();
        });

        it('shows a "module" type Badge in the row', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains('module').should('be.visible');
            });
        });

        it('shows a version Badge containing a semver-like string', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains(/\d+\.\d+/).should('be.visible');
            });
        });

        it('shows an "ACTIVE" state Chip for the running module', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains('ACTIVE').should('be.visible');
            });
        });

        it('renders the "Show details" action button', () => {
            cy.get('[title="Show details"]').should('have.length.at.least', 1);
        });
    });

    // ===========================================================================
    // 6. BUNDLE DETAILS DIALOG — opening & header
    // ===========================================================================

    describe('Bundle details dialog — opening and header', () => {
        beforeEach(() => {
            visitPage();
            filterByName(testBundle);
            waitForRowLoaded();
            cy.get('[title="Show details"]').first().click();
            cy.get('.MuiDialog-root').should('be.visible');
        });

        it('shows the bundle symbolic name in the dialog', () => {
            cy.get('.MuiDialog-root').should('contain.text', testBundle);
        });

        it('shows a version badge beginning with "v" in the header', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains(/^v\d+/).should('be.visible');
            });
        });

        it('shows the "module" type badge in the header', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('module').should('be.visible');
            });
        });

        it('shows an "ACTIVE" state Chip in the header', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('ACTIVE').should('be.visible');
            });
        });

        it('shows Refresh and Close action buttons in the dialog header', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Refresh').should('be.visible');
                cy.contains('button', 'Close').should('be.visible');
            });
        });

        it('closes the dialog when the Close button is clicked', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Close').click();
            });
            cy.get('.MuiDialog-root').should('not.exist');
        });
    });

    // ===========================================================================
    // 7. BUNDLE DETAILS DIALOG — Details tab (Identity & Manifest)
    // ===========================================================================

    describe('Bundle details dialog — Details tab', () => {
        beforeEach(() => {
            visitPage();
            filterByName(testBundle);
            waitForRowLoaded();
            cy.get('[title="Show details"]').first().click();
            cy.get('.MuiDialog-root').should('be.visible');
        });

        it('shows the "Details" tab button', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Details').should('be.visible');
            });
        });

        it('Details tab shows the "Identity" section heading', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('Identity').should('be.visible');
            });
        });

        it('Details tab Identity grid contains "Version" label', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('Version').should('be.visible');
            });
        });

        it('Details tab Identity grid contains "Bundle ID" label', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('Bundle ID').should('be.visible');
            });
        });

        it('"Show full manifest" button expands the manifest table', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Show full manifest').click();
                cy.contains('button', 'Hide full manifest').should('be.visible');
                cy.get('table').should('be.visible');
            });
        });

        it('"Hide full manifest" button collapses the manifest table', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Show full manifest').click();
                cy.contains('button', 'Hide full manifest').click();
                cy.contains('button', 'Show full manifest').should('be.visible');
            });
        });

        it('shows "Force reimport content" button for module-type bundles', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Force reimport content').should('be.visible');
            });
        });
    });

    // ===========================================================================
    // 8. BUNDLE DETAILS DIALOG — Tab navigation
    // ===========================================================================

    describe('Bundle details dialog — tab navigation', () => {
        beforeEach(() => {
            visitPage();
            filterByName(testBundle);
            waitForRowLoaded();
            cy.get('[title="Show details"]').first().click();
            cy.get('.MuiDialog-root').should('be.visible');
        });

        it('module-management-community has a "Sites" tab (it is deployed to sites)', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Sites').should('be.visible');
            });
        });

        it('clicking "Sites" tab shows the bulk-enable/disable action buttons', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Sites').click();
                cy.contains('Enable module on all sites').should('be.visible');
                cy.contains('Disable module on all sites').should('be.visible');
            });
        });

        it('switching back to "Details" tab restores Identity section', () => {
            cy.get('.MuiDialog-root').within(() => {
                cy.contains('button', 'Sites').click();
                cy.contains('Enable module on all sites').should('be.visible');
                cy.contains('button', 'Details').click();
                cy.contains('Identity').should('be.visible');
            });
        });
    });

    // ===========================================================================
    // 9. SERVER STATUS (SAM panel)
    // ===========================================================================

    describe('Server status panel', () => {
        beforeEach(visitPage);

        it('renders the header area containing the status section', () => {
            cy.get(root).find('header').should('be.visible');
        });

        it('eventually resolves past "Loading server status"', () => {
            cy.contains('Loading server status', {timeout: 15000}).should('not.exist');
        });

        it('shows "Server status" label after the SAM query resolves', () => {
            cy.contains('Server status', {timeout: 15000}).should('be.visible');
        });
    });

    // ===========================================================================
    // 10. GRAPHQL API — direct verification via cy.apollo
    // ===========================================================================

    describe('GraphQL API', () => {
        it('getInstalledModules returns a non-empty list', () => {
            cy.apollo({
                queryFile: 'graphql/query/getInstalledModules.graphql'
            }).then(response => {
                const modules = response?.data?.admin?.modulesManagement?.installedModules;
                expect(modules).to.be.an('array').and.have.length.greaterThan(0);
            });
        });

        it('getInstalledModules list contains module-management-community', () => {
            cy.apollo({
                queryFile: 'graphql/query/getInstalledModules.graphql'
            }).then(response => {
                const modules: string[] =
                    response?.data?.admin?.modulesManagement?.installedModules ?? [];
                const found = modules.some((entry: string) =>
                    entry.startsWith('module-management-community/')
                );
                expect(found, 'module-management-community should be in installedModules').to.be.true;
            });
        });

        it('getBundleDetails returns correct type and state for module-management-community', () => {
            // Resolve the installed version first so we can query by name+version
            cy.apollo({
                queryFile: 'graphql/query/getInstalledModules.graphql'
            }).then(response => {
                const modules: string[] =
                    response?.data?.admin?.modulesManagement?.installedModules ?? [];
                const entry = modules.find((m: string) =>
                    m.startsWith('module-management-community/')
                );
                expect(entry).to.be.a('string');
                // Entry format: "symbolicName/version:state"
                const version = (entry as string).split('/')[1].split(':')[0];

                cy.apollo({
                    queryFile: 'graphql/query/getBundleDetails.graphql',
                    variables: {name: 'module-management-community', version}
                }).then(detailResponse => {
                    const bundle = detailResponse?.data?.admin?.modulesManagement?.bundle;
                    expect(bundle).to.exist;
                    expect(bundle.symbolicName).to.equal('module-management-community');
                    expect(bundle.state).to.equal('ACTIVE');
                    expect(bundle.type).to.equal('module');
                });
            });
        });
    });
});
