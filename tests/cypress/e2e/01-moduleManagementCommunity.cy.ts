/**
 * End-to-end tests for the Module Management Community Jahia admin app.
 *
 * Admin route: /jahia/administration/module-management-community
 * Root element: #module-management-community-root
 *
 * Test module used as a stable reference anchor: "module-management-community"
 * (always installed and ACTIVE while the test suite runs).
 */

describe('Module Management Community', () => {
    const adminPath = '/jahia/administration/module-management-community';
    const root = '#module-management-community-root';
    const testBundle = 'module-management-community';
    const nameFilterPlaceholder = 'Filter by bundle symbolic name';

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    const visitPage = () => {
        cy.login();
        cy.visit(adminPath);
        cy.get(root, {timeout: 10000}).should('be.visible');
    };

    const filterChip = (id: string) => `[data-testid="filter-chip"][data-filter="${id}"]`;

    /** Open the editor of a filter chip */
    const openFilter = (id: string) => {
        cy.get(`${filterChip(id)} [data-testid="filter-chip-edit"]`).click();
        cy.get(`[data-testid="filter-editor"][data-filter="${id}"]`).should('be.visible');
    };

    const closeFilterEditor = () => {
        cy.get('[data-testid="filter-editor-close"]').click();
    };

    /** Type a name in the Name filter chip, then close its editor */
    const filterByName = (name: string) => {
        openFilter('name');
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).clear();
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).type(name);
        closeFilterEditor();
    };

    const toggleType = (type: string) => {
        cy.get(`[data-testid="filter-type"][data-type="${type}"]`).click();
    };

    const totalItems = () => cy.get('[data-testid="pagination-total-items"]');

    /** The ⋮ button of a row shows once the row has loaded its bundle */
    const waitForRowLoaded = () => {
        cy.get('[data-testid="row-actions-menu-btn"]', {timeout: 20000}).first().should('be.visible');
    };

    const openFirstRowDetails = () => {
        cy.get('[data-testid="row-actions-menu-btn"]').first().click();
        cy.get('[data-testid="row-menu-details"]').click();
    };

    /** Open the ⋮ more-actions menu of the action bar */
    const openMoreActionsMenu = () => {
        cy.get('[data-testid="more-actions-btn"]').click();
        cy.get('[data-testid="more-actions-menu"]').should('be.visible');
    };

    /** The update options open from the ⋮ menu */
    const openUpdateOptions = () => {
        openMoreActionsMenu();
        cy.get('[data-testid="update-options-btn"]').click();
        cy.get('#update-options-popover').should('be.visible');
    };

    // ===========================================================================
    // 1. PAGE STRUCTURE
    // ===========================================================================

    describe('Page structure', () => {
        beforeEach(visitPage);

        it('renders the application title "Modules management"', () => {
            cy.get(root).find('h1').should('contain.text', 'Modules management');
        });

        it('renders the modules table', () => {
            cy.get('[data-testid="modules-table"]', {timeout: 20000}).should('be.visible');
        });

        it('renders all expected table column headers', () => {
            cy.contains('th', 'Module name').should('be.visible');
            cy.contains('th', 'Type').should('be.visible');
            cy.contains('th', 'Installed version').should('be.visible');
            cy.contains('th', 'State').should('be.visible');
            cy.contains('th', 'Actions').should('be.visible');
        });

        it('renders the Name and Type filter chips and the Add filter button', () => {
            cy.get(filterChip('name')).should('be.visible');
            cy.get(filterChip('type')).should('be.visible');
            cy.get('[data-testid="filter-add"]').should('be.visible');
        });

        it('defaults the Type filter to the Jahia module types', () => {
            cy.get(filterChip('type')).should('contain.text', 'module, system, templatesSet');
        });

        it('renders the pagination with 100 rows per page by default', () => {
            totalItems().invoke('text').should('match', /^\d+-\d+ of \d+$/);
            cy.get('[data-testid="pagination-dropdown-items-per-page"]').should('contain.text', '100');
        });

        it('renders the Help button in the header', () => {
            cy.contains('button', 'Help').should('be.visible');
        });

        it('renders Refresh, Upload module and Install from store in the action bar', () => {
            cy.get('[role="toolbar"]').within(() => {
                cy.contains('button', 'Refresh').should('be.visible');
                cy.contains('button', 'Upload module').should('be.visible');
                cy.contains('button', 'Install from store').should('be.visible');
            });
        });

        it('renders the more-actions (⋮) menu button', () => {
            cy.get('[data-testid="more-actions-btn"]').should('be.visible');
        });

        it('shows no server status in the header of the screen', () => {
            cy.get(root).find('header').should('not.contain.text', 'Server status');
        });
    });

    // ===========================================================================
    // 2. MODULE NAME FILTER
    // ===========================================================================

    describe('Module name filter', () => {
        beforeEach(visitPage);

        it('filtering by bundle name shows only matching rows', () => {
            filterByName(testBundle);
            cy.contains('tr', testBundle).should('be.visible');
            totalItems().should('have.text', '1-1 of 1');
        });

        it('fills the Name chip with the filter value', () => {
            filterByName(testBundle);
            cy.get(filterChip('name')).should('contain.text', testBundle);
        });

        it('entering a non-existent name shows the no-match message', () => {
            filterByName('zzz-absolutely-does-not-exist-xyz');
            cy.get('[data-testid="modules-empty"]').should('contain.text', 'No module matches the filters.');
        });

        it('the clear button of the Name chip restores the full list', () => {
            filterByName('zzz-absolutely-does-not-exist-xyz');
            cy.get('[data-testid="modules-empty"]').should('be.visible');
            cy.get(`${filterChip('name')} [data-testid="filter-chip-clear"]`).click();
            totalItems().invoke('text').should('match', /^1-\d+ of \d+$/);
        });

        it('Clear filters in the action bar restores the default filters', () => {
            cy.get('[data-testid="filter-clear"]').should('be.disabled');
            filterByName('zzz-absolutely-does-not-exist-xyz');
            cy.get('[data-testid="filter-clear"]').should('not.be.disabled').click();
            totalItems().invoke('text').should('match', /^1-\d+ of \d+$/);
            cy.get(filterChip('type')).should('contain.text', 'module, system, templatesSet');
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

        it('shows the "module" type on the known bundle row', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains('module').should('be.visible');
            });
        });

        it('lists the four bundle types in the Type editor', () => {
            openFilter('type');
            ['module', 'system', 'templatesSet', 'bundle'].forEach(type => {
                cy.get(`[data-testid="filter-type"][data-type="${type}"]`).should('exist');
            });
        });

        it('unchecking "module" hides the known module (whose type is "module")', () => {
            openFilter('type');
            toggleType('module');
            closeFilterEditor();
            cy.get('[data-testid="modules-empty"]').should('be.visible');
        });

        it('checking "module" again reveals the module', () => {
            openFilter('type');
            toggleType('module');
            toggleType('module');
            closeFilterEditor();
            cy.contains('tr', testBundle).should('be.visible');
        });

        it('the clear button of the Type chip shows every type, the module included', () => {
            cy.get(`${filterChip('type')} [data-testid="filter-chip-clear"]`).click();
            cy.contains('tr', testBundle).should('be.visible');
        });
    });

    // ===========================================================================
    // 4. PAGINATION
    // ===========================================================================

    describe('Pagination', () => {
        beforeEach(visitPage);

        it('the previous-page button is disabled on page 1', () => {
            cy.get('[data-testid="pagination-button-previous-page"]').should('be.disabled');
        });

        it('the next-page button is disabled when only 1 module matches the filter', () => {
            filterByName(testBundle);
            totalItems().should('have.text', '1-1 of 1');
            cy.get('[data-testid="pagination-button-next-page"]').should('be.disabled');
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

        it('shows the "module" type as a plain label in the row', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains('module').should('be.visible');
            });
        });

        it('shows the installed version as a plain label', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains(/\d+\.\d+/).should('be.visible');
            });
        });

        it('shows an "ACTIVE" state Badge for the running module', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.contains('ACTIVE').should('be.visible');
            });
        });

        it('renders the row actions that show on hover, with their labels', () => {
            cy.contains('tr', testBundle).within(() => {
                cy.get('[data-testid="row-hover-actions"] [aria-label="Show details"]').should('exist');
                cy.get('[data-testid="row-hover-actions"] [aria-label="Refresh bundle"]').should('exist');
            });
        });

        it('the ⋮ menu of the row repeats the actions with text labels', () => {
            cy.get('[data-testid="row-actions-menu-btn"]').first().click();
            cy.get('[data-testid="row-actions-menu"]').within(() => {
                cy.contains('Show details').should('be.visible');
                cy.contains('Refresh bundle').should('be.visible');
            });
        });
    });

    // ===========================================================================
    // 6. BUNDLE DETAILS DIALOG — opening & header
    // ===========================================================================

    describe('Bundle details dialog — opening and header', () => {
        beforeEach(() => {
            visitPage();
            filterByName(testBundle);
            totalItems().should('have.text', '1-1 of 1');
            waitForRowLoaded();
            openFirstRowDetails();
            cy.contains('[data-testid="bundle-details-dialog"]', testBundle, {timeout: 15000}).should('be.visible');
        });

        it('shows the bundle symbolic name in the dialog', () => {
            cy.get('[data-testid="bundle-details-dialog"]').should('contain.text', testBundle);
        });

        it('shows a version badge beginning with "v" in the header', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains(/^v\d+/).should('be.visible');
            });
        });

        it('shows the "module" type badge in the header', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('module').should('be.visible');
            });
        });

        it('shows an "ACTIVE" state Chip in the header', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('ACTIVE').should('be.visible');
            });
        });

        it('shows Refresh and Close action buttons in the dialog header', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Refresh').should('be.visible');
                cy.contains('button', 'Close').should('be.visible');
            });
        });

        it('closes the dialog when the Close button is clicked', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Close').click();
            });
            cy.get('[data-testid="bundle-details-dialog"]').should('not.exist');
        });
    });

    // ===========================================================================
    // 7. BUNDLE DETAILS DIALOG — Details tab
    // ===========================================================================

    describe('Bundle details dialog — Details tab', () => {
        beforeEach(() => {
            visitPage();
            filterByName(testBundle);
            totalItems().should('have.text', '1-1 of 1');
            waitForRowLoaded();
            openFirstRowDetails();
            cy.contains('[data-testid="bundle-details-dialog"]', testBundle, {timeout: 15000}).should('be.visible');
        });

        it('shows the "Details" tab button', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Details').should('be.visible');
            });
        });

        it('Details tab shows the "Identity" section heading', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('Identity').should('be.visible');
            });
        });

        it('Details tab Identity grid contains "Version" label', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('Version').should('be.visible');
            });
        });

        it('Details tab Identity grid contains "Bundle ID" label', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('Bundle ID').should('be.visible');
            });
        });

        it('"Show full manifest" button expands the manifest table', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Show full manifest').click();
                cy.contains('button', 'Hide full manifest').should('be.visible');
                cy.get('table').should('exist');
            });
        });

        it('"Hide full manifest" button collapses the manifest table', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Show full manifest').click();
                cy.contains('button', 'Hide full manifest').click();
                cy.contains('button', 'Show full manifest').should('be.visible');
            });
        });

        it('shows "Force reimport content" button for module-type bundles', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
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
            totalItems().should('have.text', '1-1 of 1');
            waitForRowLoaded();
            openFirstRowDetails();
            cy.contains('[data-testid="bundle-details-dialog"]', testBundle, {timeout: 15000}).should('be.visible');
        });

        it('module-management-community has a "Sites" tab (it is deployed to sites)', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Sites').should('be.visible');
            });
        });

        it('clicking "Sites" tab shows the bulk-enable/disable action buttons', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Sites').click();
                cy.contains('Enable module on all sites').should('be.visible');
                cy.contains('Disable module on all sites').should('be.visible');
            });
        });

        it('switching back to "Details" tab restores Identity section', () => {
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Sites').click();
                cy.contains('Enable module on all sites').should('be.visible');
                cy.contains('button', 'Details').click();
                cy.contains('Identity').should('be.visible');
            });
        });
    });

    // ===========================================================================
    // 9. GRAPHQL API — direct verification via cy.apollo
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
            cy.apollo({
                queryFile: 'graphql/query/getInstalledModules.graphql'
            }).then(response => {
                const modules: string[] =
                    response?.data?.admin?.modulesManagement?.installedModules ?? [];
                const entry = modules.find((m: string) =>
                    m.startsWith('module-management-community/')
                );
                expect(entry).to.be.a('string');
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

    // ===========================================================================
    // 10. UPDATE OPTIONS POPOVER
    // ===========================================================================

    describe('Update options popover', () => {
        beforeEach(visitPage);

        it('the ⋮ menu holds the update options item', () => {
            openMoreActionsMenu();
            cy.get('[data-testid="update-options-btn"]').should('be.visible');
        });

        it('opens the update options popover from the ⋮ menu', () => {
            openUpdateOptions();
            cy.get('#update-options-popover').should('contain.text', 'Update options');
        });

        it('popover shows Quick presets: "Safe (dry run)" and "Apply now"', () => {
            openUpdateOptions();
            cy.contains('Quick presets:').should('be.visible');
            cy.contains('Safe (dry run)').should('be.visible');
            cy.contains('Apply now').should('be.visible');
        });

        it('popover shows all four update option labels with descriptions', () => {
            openUpdateOptions();
            cy.contains('Dry run').should('be.visible');
            cy.contains('Autostart modules').should('be.visible');
            cy.contains('Uninstall previous version').should('be.visible');
            cy.contains('Update on next startup').should('be.visible');
        });

        it('popover shows "Settings are saved automatically" notice', () => {
            openUpdateOptions();
            cy.contains('Settings are saved automatically').should('be.visible');
        });

        it('the Update all item shows "(DRY)" by default', () => {
            openMoreActionsMenu();
            cy.get('[data-testid="update-all-btn"]').should('contain.text', '(DRY)');
        });

        it('clicking "Apply now" preset switches Update all to "(LIVE)" mode', () => {
            openUpdateOptions();
            cy.contains('Apply now').click();
            cy.get('body').type('{esc}');
            openMoreActionsMenu();
            cy.get('[data-testid="update-all-btn"]').should('contain.text', '(LIVE)');
        });

        it('clicking "Safe (dry run)" preset restores "(DRY)" mode', () => {
            // Open popover, click Apply now (LIVE), then click Safe (dry run) — popover stays open
            openUpdateOptions();
            cy.contains('Apply now').click();
            cy.contains('Safe (dry run)').click();
            cy.get('body').type('{esc}');
            openMoreActionsMenu();
            cy.get('[data-testid="update-all-btn"]').should('contain.text', '(DRY)');
        });
    });

    // ===========================================================================
    // 11. MORE ACTIONS MENU
    // ===========================================================================

    describe('More actions (⋮) menu', () => {
        beforeEach(visitPage);

        it('renders the more-actions button', () => {
            cy.get('[data-testid="more-actions-btn"]').should('be.visible');
        });

        it('menu contains the Update all, update options and auto refresh items', () => {
            openMoreActionsMenu();
            cy.get('[data-testid="update-all-btn"]').should('be.visible');
            cy.get('[data-testid="update-options-btn"]').should('be.visible');
            cy.get('[data-testid="auto-refresh-toggle"]').should('be.visible');
        });

        it('menu contains "Export snapshot" item', () => {
            openMoreActionsMenu();
            cy.contains('Export snapshot').should('be.visible');
        });

        it('menu contains "Generate provisioning script" item', () => {
            openMoreActionsMenu();
            cy.contains('Generate provisioning script').should('be.visible');
        });

        it('menu contains "Clean up JCR versions" item', () => {
            openMoreActionsMenu();
            cy.contains('Clean up JCR versions').should('be.visible');
        });

        it('the auto refresh item is a checkbox that toggles', () => {
            openMoreActionsMenu();
            cy.get('[data-testid="auto-refresh-toggle"]').invoke('attr', 'aria-checked').then(initial => {
                cy.get('[data-testid="auto-refresh-toggle"]').click();
                cy.get('[data-testid="auto-refresh-toggle"]').should('not.have.attr', 'aria-checked', initial);
            });
        });

        it('choosing an item closes the menu and opens its dialog', () => {
            openMoreActionsMenu();
            cy.contains('Export snapshot').click();
            cy.get('[data-testid="more-actions-menu"]').should('not.exist');
            cy.get('[data-testid="export-modules-dialog"]').should('be.visible');
        });
    });
});
