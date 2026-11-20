/**
 * End-to-end tests for the keyboard and screen-reader behaviour of the two admin screens:
 *
 *  - The ⋮ menus (row and "More actions"): the WAI-ARIA menu pattern, and focus back on the opener.
 *  - A dialog opened from a menu gives focus back to the ⋮ button that opened it.
 *  - The sortable column headers, the pager names, the count status and the table region.
 *  - The auto-refresh preference that the Server status screen and the Modules screen share.
 *  - The severity listbox, the announcement region and the Refresh button of the Server status screen.
 *  - The row actions follow the state the row shows, when a bundle is stopped outside the screen.
 *  - The bundle details dialog while its data loads.
 *
 * A key is typed on the focused element, which receives its keydown as the app does. The browser, not the app,
 * turns Enter on a <button> into a click, and Cypress sends no key that a button activates on (cy.press('Enter')
 * neither): Enter on a native button is therefore a click on the focused button here.
 */

describe('Module Management Community — keyboard and screen reader', () => {
    const adminPath = '/jahia/administration/module-management-community';
    const serverStatusPath = '/jahia/administration/server-status-community';
    const root = '#module-management-community-root';
    const testBundle = 'module-management-community';
    const nameFilterPlaceholder = 'Filter by bundle symbolic name';

    /** A key on the focused element, as the keyboard sends it */
    const press = (key: string) => cy.focused().type(key);
    /** Enter or Space on the focused native button: the browser turns it into a click */
    const activateFocusedButton = () => cy.focused().should('match', 'button').click();

    /** The Apollo client of Jahia batches its operations, so a request body is an array of them. */
    const findOperation = (body: unknown, name: string) => (Array.isArray(body) ? body : [body])
        .find(operation => operation?.operationName === name);

    const visitPage = () => {
        cy.login();
        cy.visit(adminPath);
        cy.get(root, {timeout: 10000}).should('be.visible');
    };

    const nameFilter = () => cy.get(`[data-testid="module-filters"] input[placeholder="${nameFilterPlaceholder}"]`);
    const totalItems = () => cy.get('[data-testid="pagination-total-items"]');

    const filterByName = (name: string) => {
        nameFilter().clear();
        nameFilter().type(name);
        totalItems().should('have.text', '1-1 of 1');
        cy.get('[data-testid="row-actions-menu-btn"]', {timeout: 20000}).should('have.length', 1).and('be.visible');
    };

    /** The open menu that holds the element of the given test id */
    const openMenu = (testId: string) => cy.get(`[data-testid="${testId}"]`).closest('[role="menu"]');
    const menuItems = (testId: string) => openMenu(testId)
        .find('[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]');

    /** Focus is on the item at this index of the open menu; a negative index counts from the end */
    const focusIsOnItem = (testId: string, index: number) => {
        menuItems(testId).then($items => {
            const item = $items.get(index < 0 ? $items.length + index : index);
            cy.focused().should($focused => {
                expect($focused.get(0), `focus on menu item ${index}`).to.equal(item);
            });
        });
    };

    /** The accessible name that aria-labelledby gives an element */
    const labelledByName = ($el: JQuery<HTMLElement>) => ($el.attr('aria-labelledby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(id => {
            const ref = $el.get(0).ownerDocument.getElementById(id);
            return ref ? (ref.getAttribute('aria-label') || ref.textContent || '').trim() : '';
        })
        .join(' ');

    // ===========================================================================
    // 1. THE ⋮ MENUS — WAI-ARIA menu pattern
    // ===========================================================================

    describe('Menu keyboard pattern', () => {
        beforeEach(visitPage);

        it('the row ⋮ menu opens from its button with focus on its first item, moves with the arrows, Home and End, and closes on Escape', () => {
            filterByName(testBundle);
            cy.get('[data-testid="row-actions-menu-btn"]')
                .should('have.attr', 'aria-haspopup', 'menu')
                .and('have.attr', 'aria-expanded', 'false')
                .focus();
            activateFocusedButton();

            openMenu('row-actions-menu').should('have.attr', 'aria-label', `Actions of ${testBundle}`);
            cy.get('[data-testid="row-actions-menu-btn"]').should('have.attr', 'aria-expanded', 'true');
            cy.focused().should('have.attr', 'role', 'menuitem').and('have.attr', 'data-testid', 'row-menu-details');
            menuItems('row-actions-menu').should('have.length.at.least', 2);

            press('{downArrow}');
            focusIsOnItem('row-actions-menu', 1);
            press('{end}');
            focusIsOnItem('row-actions-menu', -1);
            press('{home}');
            focusIsOnItem('row-actions-menu', 0);
            press('{upArrow}');
            focusIsOnItem('row-actions-menu', -1);

            press('{esc}');
            cy.get('[data-testid="row-actions-menu"]').should('not.exist');
            cy.focused().should('have.attr', 'data-testid', 'row-actions-menu-btn');
            cy.get('[data-testid="row-actions-menu-btn"]').should('have.attr', 'aria-expanded', 'false');
        });

        it('the "More actions" menu opens on ArrowDown with focus on its first item, moves with the arrows, Home and End, and closes on Escape', () => {
            cy.get('[data-testid="more-actions-btn"]')
                .should('have.attr', 'aria-haspopup', 'menu')
                .focus();
            press('{downArrow}');

            openMenu('more-actions-menu').should('have.attr', 'aria-label', 'More actions');
            focusIsOnItem('more-actions-menu', 0);
            cy.focused().should('have.attr', 'data-testid', 'update-all-btn');

            press('{downArrow}');
            focusIsOnItem('more-actions-menu', 1);
            cy.focused().should('have.attr', 'data-testid', 'update-options-btn');
            press('{end}');
            focusIsOnItem('more-actions-menu', -1);
            press('{home}');
            focusIsOnItem('more-actions-menu', 0);

            press('{esc}');
            cy.get('[data-testid="more-actions-menu"]').should('not.exist');
            cy.focused().should('have.attr', 'data-testid', 'more-actions-btn');
        });

        it('the auto refresh item of the "More actions" menu is a menuitemcheckbox', () => {
            cy.get('[data-testid="more-actions-btn"]').click();
            cy.get('[data-testid="auto-refresh-toggle"]')
                .should('have.attr', 'role', 'menuitemcheckbox')
                .and('have.attr', 'aria-checked', 'true');
        });
    });

    // ===========================================================================
    // 2. FOCUS RETURN after a dialog opened from a menu
    // ===========================================================================

    describe('Focus return from a dialog opened from a menu', () => {
        beforeEach(visitPage);

        it('Update options, opened from "More actions" with the keyboard, gives focus back to the ⋮ button', () => {
            cy.get('[data-testid="more-actions-btn"]').focus();
            activateFocusedButton();
            focusIsOnItem('more-actions-menu', 0);
            press('{downArrow}');
            cy.focused().should('have.attr', 'data-testid', 'update-options-btn');
            press('{enter}');

            cy.get('[data-testid="update-options-dialog"]').should('be.visible');
            cy.get('[data-testid="more-actions-menu"]').should('not.exist');
            cy.get('[data-testid="update-options-close"]').click();

            cy.get('[data-testid="update-options-dialog"]').should('not.exist');
            cy.focused().should('have.attr', 'data-testid', 'more-actions-btn');
        });

        it('Show details, opened from the row ⋮ menu with the keyboard, gives focus back to the ⋮ button', () => {
            filterByName(testBundle);
            cy.get('[data-testid="row-actions-menu-btn"]').focus();
            activateFocusedButton();
            cy.focused().should('have.attr', 'data-testid', 'row-menu-details');
            press('{enter}');

            cy.get('[data-testid="bundle-details-version"]', {timeout: 15000}).should('be.visible');
            press('{esc}');

            cy.get('[data-testid="bundle-details-dialog"]').should('not.exist');
            cy.focused().should('have.attr', 'data-testid', 'row-actions-menu-btn');
        });
    });

    // ===========================================================================
    // 3. TABLE — sort buttons, pager, rows, count status, region
    // ===========================================================================

    describe('Modules table', () => {
        beforeEach(visitPage);

        it('a sortable header holds a button that sorts when activated from the keyboard focus, changes aria-sort and keeps focus', () => {
            const nameSort = '[data-testid="sort-button"][data-column="name"]';
            cy.get(nameSort, {timeout: 20000})
                .should('match', 'button')
                .and('have.attr', 'aria-label', 'Module name, sorted ascending, activate to sort descending')
                .closest('th')
                .should('have.attr', 'aria-sort', 'ascending');

            cy.get(nameSort).focus();
            activateFocusedButton();

            cy.get(nameSort).closest('th').should('have.attr', 'aria-sort', 'descending');
            cy.get(nameSort).should('have.attr', 'aria-label', 'Module name, sorted descending, activate to sort ascending');
            cy.focused().should('have.attr', 'data-testid', 'sort-button').and('have.attr', 'data-column', 'name');
        });

        it('names the pager buttons and leaves no row in the tab order', () => {
            cy.get('[data-testid="modules-table"]', {timeout: 20000}).should('be.visible');
            [
                ['first', 'First page'],
                ['previous', 'Previous page'],
                ['next', 'Next page'],
                ['last', 'Last page']
            ].forEach(([key, name]) => {
                cy.get(`[data-testid="pagination-button-${key}-page"]`).should('have.attr', 'aria-label', name);
            });
            cy.get('[data-testid="modules-table"] tbody tr').should('have.length.at.least', 1);
            cy.get('[data-testid="modules-table"] tr[tabindex]').should('not.exist');
        });

        it('the count status reads the number of installed modules, then the number that match the name filter', () => {
            cy.apollo({queryFile: 'graphql/query/getInstalledModules.graphql'}).then(response => {
                const total = (response?.data?.admin?.modulesManagement?.installedModules ?? [])
                    .filter((entry: string) => entry && entry.includes('/') && entry.includes(':'))
                    .length;
                expect(total, 'installed modules').to.be.greaterThan(1);

                cy.get('[data-testid="modules-count-status"]')
                    .should('have.attr', 'role', 'status')
                    .and('have.text', `Installed modules: ${total}`);
                nameFilter().type(testBundle);
                cy.get('[data-testid="modules-count-status"]').should('have.text', `Modules matching the filters: 1 of ${total}`);
            });
        });

        it('the module owns no main landmark: the shell holds the only one, and the table is the region "Installed modules"', () => {
            // The shell also keeps the main of its error page, hidden, in the document.
            cy.get('main:visible').should('have.length', 1).find(root).should('exist');
            cy.get(root).find('main').should('not.exist');
            cy.get('section[aria-labelledby]').filter((_, el) => labelledByName(Cypress.$(el)) === 'Installed modules')
                .should('have.length', 1)
                .find('h2')
                .should('have.text', 'Installed modules');
        });
    });

    // ===========================================================================
    // 4. AUTO-REFRESH — one preference for both screens
    // ===========================================================================

    describe('Auto refresh shared between the screens', () => {
        const autoRefreshLabel = 'Auto refresh every 30 s';

        /** The switch of the Server status screen, whether the test id is on its input or on a wrapper */
        const serverStatusSwitch = () => cy.get('[data-testid="server-status-auto-refresh"]')
            .then($el => ($el.is('input') ? $el : $el.find('input')));

        const goTo = (treeItem: string) => {
            cy.contains('[role="treeitem"]', treeItem).click();
        };

        it('turning auto refresh off on Server status turns it off in the Modules menu, and back, without a reload', () => {
            cy.login();
            cy.visit(serverStatusPath);
            cy.get('[data-testid="server-status-summary"]', {timeout: 20000}).should('be.visible');
            // A reload would reset this mark, so it proves the screens change inside one page.
            cy.window().then(win => {
                (win as unknown as {sharedPreferenceMark: boolean}).sharedPreferenceMark = true;
            });

            serverStatusSwitch().should('be.checked');
            cy.contains('label', autoRefreshLabel).click();
            serverStatusSwitch().should('not.be.checked');

            goTo('Module Management (Community)');
            cy.get(root, {timeout: 10000}).should('be.visible');
            cy.get('[data-testid="more-actions-btn"]').click();
            cy.get('[data-testid="auto-refresh-toggle"]').should('have.attr', 'aria-checked', 'false');
            cy.get('[data-testid="auto-refresh-toggle"]').click();
            cy.get('[data-testid="auto-refresh-toggle"]').should('have.attr', 'aria-checked', 'true');
            press('{esc}');

            goTo('Server Status (Community)');
            cy.get('[data-testid="server-status-summary"]', {timeout: 20000}).should('be.visible');
            serverStatusSwitch().should('be.checked');
            cy.window().its('sharedPreferenceMark').should('equal', true);
        });
    });

    // ===========================================================================
    // 5. SERVER STATUS — severity name, announcement region, Refresh
    // ===========================================================================

    describe('Server status screen', () => {
        beforeEach(() => {
            cy.login();
            cy.visit(serverStatusPath);
            cy.get('[data-testid="server-status-summary"]', {timeout: 20000}).should('be.visible');
        });

        it('names the severity listbox with its label and its value', () => {
            cy.get('[data-testid="server-status-severity"] [role="listbox"]').should($listbox => {
                expect(labelledByName($listbox)).to.match(/^Severity\s+High and above$/);
            });
        });

        it('has a polite status region for the announcements', () => {
            cy.get('[data-testid="server-status-announcement"]').should('have.attr', 'role', 'status');
        });

        it('Refresh stays enabled and keeps focus while the status reloads', () => {
            cy.intercept('POST', '**/modules/graphql', req => {
                if (findOperation(req.body, 'GetServerStatus')) {
                    req.alias = 'serverStatus';
                    req.continue(res => {
                        res.setDelay(2000);
                    });
                }
            });
            cy.get('[data-testid="server-status-refresh"]').should('not.be.disabled').focus();
            activateFocusedButton();

            cy.get('[data-testid="server-status-refresh"]')
                .should('have.attr', 'aria-busy', 'true')
                .and('not.be.disabled');
            cy.focused().should('have.attr', 'data-testid', 'server-status-refresh');
            cy.wait('@serverStatus');
            cy.get('[data-testid="server-status-refresh"]').should('not.have.attr', 'aria-busy', 'true');
            cy.get('[data-testid="server-status-refresh"]').should('not.be.disabled');
            cy.focused().should('have.attr', 'data-testid', 'server-status-refresh');
        });
    });

    // ===========================================================================
    // 6. ROW ACTIONS follow the state the row shows
    // ===========================================================================

    describe('Row actions after a bundle is stopped outside the screen', () => {
        // Jahia modules that no screen of the test depends on; the first one installed is used.
        const candidates = ['contentRetrieval', 'news', 'event', 'location', 'person', 'rating', 'tags'];
        let target: {name: string, bundleId: number} | undefined;

        /** An installed Jahia module that the name filter keeps alone in the table */
        const isUsable = (candidate: string, names: string[], types: string[]) =>
            names.includes(candidate) &&
            types.includes(`${candidate}:module`) &&
            names.filter(other => other.includes(candidate)).length === 1;

        before(() => {
            cy.apollo({queryFile: 'graphql/query/getInstalledModules.graphql'}).then(response => {
                const modulesManagement = response?.data?.admin?.modulesManagement;
                const entries: string[] = modulesManagement?.installedModules ?? [];
                const types: string[] = modulesManagement?.installedBundleTypes ?? [];
                const names = entries.map(entry => entry.split('/')[0]);
                const name = candidates.find(candidate => isUsable(candidate, names, types));
                expect(name, `an installed module among ${candidates.join(', ')}`).to.be.a('string');
                const version = entries.find(entry => entry.startsWith(`${name}/`)).split('/')[1].split(':')[0];
                cy.apollo({
                    queryFile: 'graphql/query/getBundleDetails.graphql',
                    variables: {name, version}
                }).then(details => {
                    const bundleId = details?.data?.admin?.modulesManagement?.bundle?.bundleId;
                    expect(bundleId, `bundle id of ${name}`).to.exist;
                    target = {name, bundleId};
                });
            });
        });

        const startTarget = () => {
            if (target) {
                cy.apollo({mutationFile: 'graphql/mutation/startBundle.graphql', variables: {bundleId: target.bundleId}});
            }
        };

        // A retry starts from an active bundle too.
        beforeEach(startTarget);
        after(startTarget);

        it('offers Start, not Stop, in the ⋮ menu once the poll shows the bundle resolved', () => {
            let isStopped = false;
            cy.intercept('POST', '**/modules/graphql', req => {
                if (isStopped && findOperation(req.body, 'InstalledModules')) {
                    req.alias = 'installedModulesPoll';
                }
            });
            visitPage();
            filterByName(target.name);
            cy.get('[data-testid="modules-table"] tbody tr').first().should('contain.text', 'Active');
            cy.get('[data-testid="row-actions-menu-btn"]').click();
            cy.get('[data-testid="row-menu-stop"]').should('exist');
            cy.get('[data-testid="row-menu-start"]').should('not.exist');
            press('{esc}');
            cy.get('[data-testid="row-actions-menu"]').should('not.exist');

            // Another administrator stops the bundle: the screen learns it only from its 30 s poll.
            cy.apollo({mutationFile: 'graphql/mutation/stopBundle.graphql', variables: {bundleId: target.bundleId}}).then(() => {
                isStopped = true;
            });
            cy.wait('@installedModulesPoll', {timeout: 40000});
            cy.get('[data-testid="modules-table"] tbody tr').first().should('contain.text', 'Resolved');

            cy.get('[data-testid="row-actions-menu-btn"]').click();
            cy.get('[data-testid="row-menu-start"]').should('exist');
            cy.get('[data-testid="row-menu-stop"]').should('not.exist');
        });
    });

    // ===========================================================================
    // 7. BUNDLE DETAILS DIALOG while it loads
    // ===========================================================================

    describe('Bundle details dialog while it loads', () => {
        beforeEach(visitPage);

        it('is named by the bundle and offers a Close button before its data arrives', () => {
            cy.intercept('POST', '**/modules/graphql', req => {
                if (findOperation(req.body, 'BundleDetails')) {
                    req.alias = 'bundleDetails';
                    req.continue(res => {
                        res.setDelay(4000);
                    });
                }
            });
            filterByName(testBundle);
            cy.get('[data-testid="row-actions-menu-btn"]').click();
            cy.get('[data-testid="row-menu-details"]').click();

            cy.get('[data-testid="bundle-details-dialog"]').should('be.visible');
            // Still loading: the version shows only once the data is there.
            cy.get('[data-testid="bundle-details-version"]').should('not.exist');
            cy.get('[data-testid="bundle-details-dialog"]').should($dialog => {
                expect(labelledByName($dialog)).to.equal(testBundle);
            });
            cy.get('[data-testid="bundle-details-dialog"] [role="status"]').should('contain.text', 'Loading');
            cy.get('#bundle-details-close').should('be.visible').and('contain.text', 'Close');

            cy.wait('@bundleDetails');
            cy.get('[data-testid="bundle-details-version"]').should('be.visible');
            cy.get('#bundle-details-close').click();
            cy.get('[data-testid="bundle-details-dialog"]').should('not.exist');
        });
    });
});
