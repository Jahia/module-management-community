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

    /** The name of a control: aria-labelledby, else aria-label, else its text, or the text of its label, without the hidden parts */
    const accessibleName = ($el: JQuery<HTMLElement>) => {
        const labelled = labelledByName($el);
        if (labelled) {
            return labelled;
        }

        const label = ($el.attr('aria-label') || '').trim();
        if (label) {
            return label;
        }

        const element = $el.get(0);
        const source = element.matches('input') ? element.closest('label') : element;
        if (!source) {
            return '';
        }

        const clone = source.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('[aria-hidden="true"], input').forEach(node => node.remove());
        return (clone.textContent || '').replace(/\s+/g, ' ').trim();
    };

    /** The text that aria-describedby points to */
    const describedByText = ($el: JQuery<HTMLElement>) => ($el.attr('aria-describedby') || '')
        .split(/\s+/)
        .filter(Boolean)
        .map(id => ($el.get(0).ownerDocument.getElementById(id)?.textContent || '').trim())
        .join(' ')
        .trim();

    /** The element of this test id is a dialog, and its name is not empty */
    const dialogIsNamed = (testId: string, name?: string) => {
        cy.get(`[data-testid="${testId}"]`).should($dialog => {
            expect($dialog.attr('role'), `role of ${testId}`).to.match(/^(alert)?dialog$/);
            const dialogName = accessibleName($dialog);
            expect(dialogName, `name of ${testId}`).not.to.equal('');
            if (name) {
                expect(dialogName, `name of ${testId}`).to.equal(name);
            }
        });
    };

    /** The controls of an element that Tab reaches, in the order of the document */
    const tabbables = ($root: JQuery<HTMLElement>) => $root
        .find('button, input, select, textarea, a[href], [tabindex]')
        .filter((_, el) => el.getAttribute('tabindex') !== '-1' &&
            !(el as HTMLButtonElement).disabled &&
            el.getAttribute('aria-hidden') !== 'true' &&
            el.getClientRects().length > 0 &&
            !(el.matches('input[type="radio"]') && !(el as HTMLInputElement).checked));

    /** Focus is on the first control that Tab reaches in the dialog of this test id */
    const focusIsOnFirstControl = (testId: string) => {
        cy.get(`[data-testid="${testId}"]`).should($dialog => {
            const first = tabbables($dialog).get(0);
            expect(first, `a control in ${testId}`).to.exist;
            expect($dialog.get(0).ownerDocument.activeElement, `focus on the first control of ${testId}`).to.equal(first);
        });
    };

    const operationsOf = (body: unknown) => (Array.isArray(body) ? body : [body]);
    /** A GraphQL operation that selects this field */
    const selectsField = (operation: {query?: string}, field: string) => new RegExp(`\\b${field}\\b`).test(operation?.query || '');

    /**
     * Answers every request that selects one of these fields of admin.modulesManagement with the given value, so the
     * server never runs it. Another operation batched with it gets an error, as it must not reach the server either.
     */
    const stubModulesManagementFields = (values: Record<string, unknown>) => {
        cy.intercept('POST', '**/modules/graphql', req => {
            const stubbed = operationsOf(req.body).map(operation => Object.keys(values).find(field => selectsField(operation, field)));
            if (stubbed.some(Boolean)) {
                req.alias = stubbed.find(Boolean);
                const results = stubbed.map(field => (field ?
                    {data: {admin: {modulesManagement: {[field]: values[field]}}}} :
                    {errors: [{message: 'Not sent by the test'}]}));
                req.reply(Array.isArray(req.body) ? results : results[0]);
            }
        });
    };

    type ModulesManagementData = {admin: {modulesManagement: {installedModules?: string[], availableUpdates?: string[]}}};

    /** Rewrites the result of a named operation that the server answered; the request takes the alias <operation>Result */
    const rewriteResult = (operationName: string, rewrite: (data: ModulesManagementData) => void) => {
        cy.intercept('POST', '**/modules/graphql', req => {
            const index = operationsOf(req.body).findIndex(operation => operation?.operationName === operationName);
            if (index >= 0) {
                req.alias = `${operationName}Result`;
                req.continue(res => {
                    const result = Array.isArray(res.body) ? res.body[index] : res.body;
                    if (result?.data) {
                        rewrite(result.data);
                    }
                });
            }
        });
    };

    /** The installed modules, with the module of the test in this OSGi state (an int of Bundle.getState()) */
    const withTestBundleState = (entries: string[], osgiState: number) => entries
        .map(entry => (entry.startsWith(`${testBundle}/`) ? entry.replace(/:[^:]*$/, `:${osgiState}`) : entry));

    const openTestBundleDetails = () => {
        filterByName(testBundle);
        cy.get('[data-testid="row-actions-menu-btn"]').click();
        cy.get('[data-testid="row-menu-details"]').click();
        cy.get('[data-testid="bundle-details-version"]', {timeout: 15000}).should('be.visible');
    };

    const openFromMoreActions = (itemTestId: string, dialogTestId: string) => {
        cy.get('[data-testid="more-actions-btn"]').click();
        cy.get(`[data-testid="${itemTestId}"]`).click();
        cy.get(`[data-testid="${dialogTestId}"]`).should('be.visible');
    };

    /** Generate script, pressed from the keyboard focus, opens the result dialog */
    const openGeneratedScript = () => {
        openFromMoreActions('generate-script-btn', 'generate-script-dialog');
        cy.contains('[data-testid="generate-script-dialog"] button', 'Generate script', {timeout: 15000})
            .should('not.be.disabled')
            .focus();
        activateFocusedButton();
        cy.get('[data-testid="dryrun-result-dialog"]', {timeout: 30000}).should('be.visible');
    };

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

        // A cy.clock() cannot drive this: the Apollo client batches its operations on a timer, so a frozen clock stops
        // every request, and the poll timer that runs when the clock is installed stays a real one. The test counts the
        // ServerHealth requests over a real minute and more instead: it lasts about two and a half minutes.
        it('with auto refresh off, the health of the navigation icon polls no more; on again, it polls within a minute', () => {
            const pollInterval = 60000;
            // The phase decides which requests count: those of the page load count for nothing.
            let phase = 'load';
            let requestsWhileOff = 0;
            cy.intercept('POST', '**/modules/graphql', req => {
                if (findOperation(req.body, 'ServerHealth')) {
                    if (phase === 'off') {
                        requestsWhileOff += 1;
                    } else if (phase === 'on') {
                        req.alias = 'healthPoll';
                    }
                }
            });
            cy.login();
            cy.visit(serverStatusPath);
            cy.get('[data-testid="server-status-summary"]', {timeout: 20000}).should('be.visible');
            serverStatusSwitch().should('be.checked');

            cy.contains('label', autoRefreshLabel).click();
            serverStatusSwitch().should('not.be.checked').then(() => {
                phase = 'off';
            });
            // Longer than the poll interval, so a poll that still ran would show
            cy.wait(pollInterval + 5000);
            cy.then(() => {
                expect(requestsWhileOff, 'ServerHealth requests while auto refresh is off').to.equal(0);
            });

            cy.contains('label', autoRefreshLabel).click();
            serverStatusSwitch().should('be.checked').then(() => {
                phase = 'on';
            });
            cy.wait('@healthPoll', {timeout: pollInterval + 15000});
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

    // ===========================================================================
    // 8. STICKY HEADER AND PAGER do not cover a focused control
    // ===========================================================================

    describe('Sticky header and pager of the table', () => {
        beforeEach(visitPage);

        it('with 100 rows per page, each row ⋮ button that takes focus shows, not covered by the sticky header or pager', () => {
            totalItems().invoke('text').should('match', /^1-\d+ of \d+$/);
            cy.get('[data-testid="pagination-dropdown-items-per-page"]').should('contain.text', '100');
            cy.get('[data-testid="row-actions-menu-btn"]', {timeout: 20000}).should('have.length.greaterThan', 10);
            cy.get('[data-testid="modules-table"]').should($table => {
                const table = $table.get(0);
                expect(table.scrollHeight, 'the table scrolls under its sticky header and pager').to.be.greaterThan(table.clientHeight);
            });

            cy.get('[data-testid="row-actions-menu-btn"]').then($buttons => {
                $buttons.each((index, button) => {
                    // A focus scrolls the button into view at once, by the scroll padding of the table
                    button.focus();
                    const rect = button.getBoundingClientRect();
                    const hit = button.ownerDocument.elementFromPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
                    expect(button.contains(hit), `the ⋮ button of row ${index + 1} is under the pointer at its centre`).to.equal(true);
                });
            });
        });
    });

    // ===========================================================================
    // 9. REFLOW — the details dialog at 320 × 180
    // ===========================================================================

    describe('Bundle details dialog on a small screen', () => {
        /** The focused control is in the dialog and in the viewport; one taller or wider than the viewport shows its start */
        const focusIsInDialogAndViewport = ($focused: JQuery<HTMLElement>) => {
            const element = $focused.get(0);
            const view = element.ownerDocument.defaultView;
            const rect = element.getBoundingClientRect();
            const label = accessibleName($focused) || element.tagName;
            expect(element.closest('[data-testid="bundle-details-dialog"]'), `${label} is in the dialog`).to.exist;
            expect(rect.top, `top of ${label}`).to.be.within(0, view.innerHeight - 1);
            expect(rect.left, `left of ${label}`).to.be.within(0, view.innerWidth - 1);
            if (rect.height <= view.innerHeight) {
                expect(rect.bottom, `bottom of ${label}`).to.be.at.most(view.innerHeight);
            }

            if (rect.width <= view.innerWidth) {
                expect(rect.right, `right of ${label}`).to.be.at.most(view.innerWidth);
            }
        };

        beforeEach(visitPage);

        it('at 320 × 180 the dialog scrolls as a whole, and Tab keeps each focused control in the viewport', () => {
            openTestBundleDetails();
            cy.viewport(320, 180);

            cy.get('[data-testid="bundle-details-dialog"]').should($dialog => {
                const dialog = $dialog.get(0);
                expect($dialog.attr('role')).to.equal('dialog');
                expect(dialog.ownerDocument.defaultView.getComputedStyle(dialog).overflowY, 'the dialog scrolls').to.be.oneOf(['auto', 'scroll']);
                expect(dialog.clientHeight, 'height of the dialog').to.be.greaterThan(100);
                expect(dialog.scrollHeight, 'the content is taller than the dialog').to.be.greaterThan(dialog.clientHeight);
            });

            cy.get('[data-testid="bundle-details-dialog"]').then($dialog => {
                const count = tabbables($dialog).length;
                expect(count, 'controls of the dialog').to.be.greaterThan(3);
                for (let index = 0; index < count; index++) {
                    cy.press(Cypress.Keyboard.Keys.TAB);
                    cy.focused().should(focusIsInDialogAndViewport);
                }
            });
            cy.viewport(Cypress.config('viewportWidth'), Cypress.config('viewportHeight'));
        });
    });

    // ===========================================================================
    // 10. NAMES — the update options and the dialogs
    // ===========================================================================

    describe('Names of the update options and of the dialogs', () => {
        beforeEach(visitPage);

        it('each switch of Update options is named by its visible label and described by the text under it', () => {
            openFromMoreActions('update-options-btn', 'update-options-dialog');
            cy.get('[data-testid="update-options-dialog"] input[type="checkbox"]').should('have.length', 4).each($switch => {
                const visibleLabel = ($switch.closest('label').find('span').last().text() || '').trim();
                expect(visibleLabel, 'visible label of the switch').not.to.equal('');
                expect(accessibleName($switch), 'name of the switch').to.equal(visibleLabel);
                expect($switch.attr('aria-describedby'), `description of ${visibleLabel}`).to.be.a('string');
                expect(describedByText($switch), `description of ${visibleLabel}`).not.to.equal('');
            });
        });

        it('Update options, Export, Generate script and its result, Upload and Install from store each have a name', () => {
            openFromMoreActions('update-options-btn', 'update-options-dialog');
            dialogIsNamed('update-options-dialog', 'Update options');
            cy.get('[data-testid="update-options-close"]').click();

            openFromMoreActions('export-snapshot-btn', 'export-modules-dialog');
            dialogIsNamed('export-modules-dialog', 'Export module snapshot');
            cy.contains('[data-testid="export-modules-dialog"] button', 'Cancel').click();

            openGeneratedScript();
            dialogIsNamed('generate-script-dialog', 'Generate provisioning script');
            dialogIsNamed('dryrun-result-dialog', 'Provisioning script — module set');
            cy.contains('[data-testid="dryrun-result-dialog"] button', 'Close').click();
            cy.get('[data-testid="dryrun-result-dialog"]').should('not.exist');

            cy.get('[data-testid="upload-module-btn"]').click();
            dialogIsNamed('upload-module-dialog', 'Deploy / Import module');
            cy.contains('[data-testid="upload-module-dialog"] button', 'Cancel').click();

            cy.get('[data-testid="install-from-store-btn"]').click();
            dialogIsNamed('install-from-store-dialog', 'Install from store');
        });
    });

    describe('Name of the uninstall confirmation', () => {
        it('the confirmation of Uninstall, offered for a resolved module, has a name', () => {
            // The table shows the module of the test resolved, and no request may uninstall anything
            rewriteResult('InstalledModules', data => {
                data.admin.modulesManagement.installedModules = withTestBundleState(data.admin.modulesManagement.installedModules, 4);
            });
            stubModulesManagementFields({uninstall: null});
            visitPage();
            filterByName(testBundle);
            cy.get('[data-testid="modules-table"] tbody tr').first().should('contain.text', 'Resolved');
            cy.get('[data-testid="row-actions-menu-btn"]').click();
            cy.get('[data-testid="row-menu-uninstall"]').click();

            dialogIsNamed('uninstall-confirm-dialog', `Uninstall ${testBundle}?`);
            cy.contains('[data-testid="uninstall-confirm-dialog"] button', 'Cancel').click();
            cy.get('[data-testid="uninstall-confirm-dialog"]').should('not.exist');
        });
    });

    // ===========================================================================
    // 11. FOCUS AFTER AN ACTION of a dialog
    // ===========================================================================

    describe('Focus after the main action of a dialog', () => {
        beforeEach(visitPage);

        it('Preview YAML of Export moves focus to the preview', () => {
            openFromMoreActions('export-snapshot-btn', 'export-modules-dialog');
            cy.contains('[data-testid="export-modules-dialog"] button', 'Preview YAML').focus();
            activateFocusedButton();
            cy.focused({timeout: 30000})
                .should('match', 'pre')
                .and('have.attr', 'aria-label', 'YAML provisioning preview');
        });

        it('Generate script moves focus into the result dialog', () => {
            openGeneratedScript();
            cy.focused().should($focused => {
                expect($focused.get(0).closest('[data-testid="dryrun-result-dialog"]'), 'focus in the result dialog').to.exist;
            });
        });

        it('Install from store, opened from the keyboard, focuses its first control; an install moves focus to Close', () => {
            // The catalogue and the installation are answered here, so nothing is installed
            stubModulesManagementFields({
                storeModules: [{symbolicName: 'cypress-store-module', title: 'Cypress store module', icon: null, latestVersion: '1.0.0', storeUrl: 'https://store.jahia.com'}],
                installStoreModules: 'Stubbed installation'
            });
            cy.get('[data-testid="install-from-store-btn"]').focus();
            activateFocusedButton();
            dialogIsNamed('install-from-store-dialog', 'Install from store');
            cy.wait('@storeModules');
            focusIsOnFirstControl('install-from-store-dialog');

            cy.contains('[data-testid="install-from-store-dialog"] label', 'Cypress store module').click();
            cy.contains('[data-testid="install-from-store-dialog"] button', 'Install selected (1)').focus();
            activateFocusedButton();
            cy.wait('@installStoreModules');
            cy.get('[data-testid="install-from-store-dialog"] [role="status"]').should('contain.text', 'Stubbed installation');
            cy.focused().should('have.attr', 'data-focus', 'close').and('have.text', 'Close');
        });

        it('Upload, opened from the keyboard, focuses its first control; a deploy moves focus to Close', () => {
            // The upload is answered here, so nothing is deployed
            cy.intercept('POST', '**/modules/module-management-community/upload', {statusCode: 200, body: {message: 'Stubbed deploy'}}).as('upload');
            cy.get('[data-testid="upload-module-btn"]').focus();
            activateFocusedButton();
            dialogIsNamed('upload-module-dialog', 'Deploy / Import module');
            focusIsOnFirstControl('upload-module-dialog');

            cy.get('[data-testid="upload-module-dialog"] input[type="file"]')
                .selectFile({contents: Cypress.Buffer.from('not a bundle'), fileName: 'cypress-module-1.0.0.jar'}, {force: true});
            cy.contains('[data-testid="upload-module-dialog"] button', 'Deploy').should('not.be.disabled').focus();
            activateFocusedButton();
            cy.wait('@upload');
            cy.get('[data-testid="upload-module-dialog"] [role="status"]').should('contain.text', 'Stubbed deploy');
            cy.focused().should('have.attr', 'data-focus', 'close').and('have.text', 'Close');
        });
    });

    // ===========================================================================
    // 12. FILTERS keep what the user chose
    // ===========================================================================

    describe('Filters that no module matches any more', () => {
        const chip = (filter: string) => cy.get(`[data-testid="filter-chip"][data-filter="${filter}"]`);
        const openChip = (filter: string) => chip(filter).find('[data-testid="filter-chip-edit"]').click();
        const closeEditor = () => cy.get('[data-testid="filter-editor-close"]').click();

        it('the Updates chip stays while "updates only" is on and no update is left', () => {
            let hasUpdate = true;
            rewriteResult('AvailableUpdates', data => {
                data.admin.modulesManagement.availableUpdates = hasUpdate ? [`${testBundle}/0.0.1:99.0.0`] : [];
            });
            visitPage();
            openChip('updates');
            cy.get('[data-testid="filter-updates"]').click();
            closeEditor();
            cy.get('[data-testid="modules-table"] tbody tr').should('contain.text', testBundle);

            cy.then(() => {
                hasUpdate = false;
            });
            cy.get('[data-testid="refresh-btn"]').click();
            cy.wait('@AvailableUpdatesResult');
            cy.get('[data-testid="modules-empty"]').should('contain.text', 'No module matches the filters.');
            chip('updates').should('contain.text', 'available only');
            openChip('updates');
            cy.get('[data-testid="filter-updates"] input').should('be.checked');
        });

        it('a module whose dependency had an update leaves "updates only" once that update goes', () => {
            // The module of the test depends on graphql-dxm-provider, so an update of that provider lists it too
            let hasUpdate = true;
            rewriteResult('AvailableUpdates', data => {
                data.admin.modulesManagement.availableUpdates = hasUpdate ? ['graphql-dxm-provider/0.0.1:99.0.0'] : [];
            });
            visitPage();
            openChip('updates');
            cy.get('[data-testid="filter-updates"]').click();
            closeEditor();
            cy.get('[data-testid="modules-table"] tbody tr', {timeout: 15000}).should('contain.text', testBundle);

            cy.then(() => {
                hasUpdate = false;
            });
            cy.get('[data-testid="refresh-btn"]').click();
            cy.wait('@AvailableUpdatesResult');
            cy.get('[data-testid="modules-empty"]').should('contain.text', 'No module matches the filters.');
        });

        it('a selected State that no module has any more stays checked in its editor', () => {
            let isStarting = true;
            let realStates: string[] = [];
            // The module of the test shows Starting (8), a state that no installed module stays in, then its real state
            rewriteResult('InstalledModules', data => {
                const modulesManagement = data.admin.modulesManagement;
                if (isStarting) {
                    modulesManagement.installedModules = withTestBundleState(modulesManagement.installedModules, 8);
                } else {
                    realStates = modulesManagement.installedModules.map((entry: string) => entry.substring(entry.lastIndexOf(':') + 1));
                }
            });
            visitPage();
            openChip('state');
            cy.get('[data-testid="filter-state"][data-state="STARTING"]').click();
            closeEditor();
            cy.get('[data-testid="modules-table"] tbody tr').should('have.length', 1).and('contain.text', testBundle);

            cy.then(() => {
                isStarting = false;
            });
            cy.get('[data-testid="refresh-btn"]').click();
            cy.wait('@InstalledModulesResult').then(() => {
                expect(realStates, 'states of the installed modules').not.to.include('8');
            });
            cy.get('[data-testid="modules-empty"]').should('contain.text', 'No module matches the filters.');
            chip('state').should('contain.text', 'Starting');
            openChip('state');
            cy.get('[data-testid="filter-state"][data-state="STARTING"] input').should('be.checked');
        });
    });

    // ===========================================================================
    // 13. RESULT MESSAGES — Bundle details, Dry run result, Upload drop zone
    // ===========================================================================

    describe('Result messages', () => {
        beforeEach(visitPage);

        it('the reimport result of Bundle details stays until it is dismissed', () => {
            // The reimport is answered here, so no content is imported again
            stubModulesManagementFields({importModule: 'Stubbed reimport'});
            openTestBundleDetails();
            // From here a timer runs only when the test moves the clock: the first tick sends the batched request
            cy.clock();
            cy.contains('[data-testid="bundle-details-actions"] button', 'Force reimport content').click();
            cy.tick(100);
            cy.wait('@importModule');
            cy.contains('[data-testid="bundle-details-dialog"] [role="status"]', 'Stubbed reimport').should('be.visible');
            // A minute, far longer than the 5 s of a notification: the message must not leave on a timer
            cy.tick(60000);
            cy.contains('[data-testid="bundle-details-dialog"] [role="status"]', 'Stubbed reimport').should('be.visible');
            cy.get('[data-testid="bundle-details-dialog"] button[aria-label="Dismiss message"]').click();
            cy.contains('[data-testid="bundle-details-dialog"] [role="status"]', 'Stubbed reimport').should('not.exist');
        });

        it('the copy button of the Dry run result names what it copies, and the status reads the result of a copy', () => {
            const copyButton = () => cy.get('[data-testid="dryrun-result-dialog"] button').filter((_, el) => /^Copy /.test(el.textContent.trim()));
            const copyStatus = () => cy.get('[data-testid="dryrun-result-dialog"] [role="status"]');
            let copyWorks = true;
            const writeText = cy.stub().callsFake(() => (copyWorks ? Promise.resolve() : Promise.reject(new Error('Denied'))));
            cy.window().then(win => {
                Object.defineProperty(win.navigator, 'clipboard', {value: {writeText}, configurable: true});
            });
            openGeneratedScript();

            copyButton().should('have.text', 'Copy YAML').click();
            copyStatus().should('have.text', 'The YAML script was copied to the clipboard.');
            cy.wrap(writeText).should('have.been.calledWithMatch', 'installOrUpgradeBundle');

            cy.contains('[data-testid="dryrun-result-dialog"] button', 'cURL').click();
            copyStatus().should('have.text', '');
            copyButton().should('have.text', 'Copy cURL command').click();
            copyStatus().should('have.text', 'The cURL command was copied to the clipboard.');
            cy.wrap(writeText).should('have.been.calledWithMatch', /^curl /);

            cy.then(() => {
                copyWorks = false;
            });
            copyButton().click();
            copyStatus().should('have.text', 'Could not copy to the clipboard. Select the text in the code block and copy it by hand.');
        });

        it('the drop zone of Upload is a button whose name holds the selected file name', () => {
            const fileName = 'cypress-module-1.0.0.jar';
            const dropZone = () => cy.get('[data-testid="upload-module-dialog"] button[aria-describedby]');
            cy.get('[data-testid="upload-module-btn"]').click();
            dropZone().should($zone => {
                expect(accessibleName($zone)).to.contain('Drag & drop a .jar or .tgz file here');
            });

            cy.get('[data-testid="upload-module-dialog"] input[type="file"]')
                .selectFile({contents: Cypress.Buffer.from('not a bundle'), fileName}, {force: true});
            dropZone().should($zone => {
                expect($zone.get(0).tagName).to.equal('BUTTON');
                expect(accessibleName($zone)).to.contain(fileName);
            });
            // Nothing is deployed
            cy.contains('[data-testid="upload-module-dialog"] button', 'Cancel').click();
            cy.get('[data-testid="upload-module-dialog"]').should('not.exist');
        });
    });
});
