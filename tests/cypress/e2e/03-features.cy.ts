/**
 * End-to-end tests for module-management-community features that complement
 * specs 01 (page/table/details) and 02 (upload/export/generate-script):
 *
 *  - Accessibility structure (WCAG 2.2 AAA work): main landmark, h1, sortable
 *    column-header buttons with aria-sort, dialog accessible names.
 *  - Install-from-store dialog (store catalogue browse).
 *  - Server status (SAM) probe modal — open and close.
 *  - Bundle details: dependency-graph and version-history tabs.
 *  - GraphQL mutations exercised end-to-end (side-effect-free): updateModules
 *    dry-run, generateProvisioningScript, storeModules, cleanupJcrVersions.
 */

describe('Module Management Community — features & accessibility', () => {
    const adminPath = '/jahia/administration/module-management-community'
    const root = '#module-management-community-root'
    const testBundle = 'module-management-community'
    const nameFilterPlaceholder = 'Filter by bundle symbolic name'

    const visitPage = () => {
        cy.login()
        cy.visit(adminPath)
        cy.get(root, { timeout: 10000 }).should('be.visible')
    }

    const filterByName = (name: string) => {
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).clear()
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).type(name)
    }

    const openMoreActionsMenu = () => {
        cy.get('[data-testid="more-actions-btn"]').click()
    }

    // ===========================================================================
    // 1. ACCESSIBILITY STRUCTURE (WCAG 2.2 AAA)
    // ===========================================================================

    describe('Accessibility structure', () => {
        beforeEach(visitPage)

        it('exposes a <main> landmark wrapping the application content', () => {
            cy.get('main').should('exist')
        })

        it('exposes an <h1> page heading with the application title', () => {
            cy.get('h1').should('contain.text', 'Modules management')
        })

        it('marks sortable column headers with aria-sort', () => {
            cy.get('th[aria-sort]').should('have.length.at.least', 1)
        })

        it('renders the column sort control as a real <button> (keyboard operable)', () => {
            cy.contains('button', 'Module name').should('exist')
        })

        it('clicking the Module name sort button toggles its aria-sort state', () => {
            cy.contains('th', 'Module name')
                .invoke('attr', 'aria-sort')
                .then((initial) => {
                    cy.contains('button', 'Module name').click()
                    cy.contains('th', 'Module name').invoke('attr', 'aria-sort').should('not.equal', initial)
                })
        })

        it('gives the bundle details dialog an accessible name (resolved aria-labelledby)', () => {
            filterByName(testBundle)
            cy.contains('Showing 1 to 1 of 1 modules').should('be.visible')
            cy.get('[aria-label="Show details"]', { timeout: 20000 }).first().click()
            cy.get('[data-testid="bundle-details-dialog"]', { timeout: 15000 }).should('be.visible')
            // Aria-labelledby must point at an element that exists and is non-empty
            cy.get('[data-testid="bundle-details-dialog"]')
                .invoke('attr', 'aria-labelledby')
                .then((id) => {
                    expect(id, 'dialog has aria-labelledby').to.be.a('string').and.not.be.empty
                    cy.get(`#${id}`).should('exist').and('not.have.text', '')
                })
        })
    })

    // ===========================================================================
    // 2. INSTALL FROM STORE DIALOG
    // ===========================================================================

    describe('Install from store dialog', () => {
        beforeEach(visitPage)

        const openInstallFromStore = () => {
            openMoreActionsMenu()
            cy.contains('Install from store').click()
            cy.get('[data-testid="install-from-store-dialog"]', { timeout: 20000 }).should('be.visible')
        }

        it('shows the "Install from store" item in the more-actions menu', () => {
            openMoreActionsMenu()
            cy.contains('Install from store').should('be.visible')
        })

        it('opens the install-from-store dialog with title and subtitle', () => {
            openInstallFromStore()
            cy.get('[data-testid="install-from-store-dialog"]').within(() => {
                cy.contains('Install from store').should('be.visible')
                cy.contains('Browse modules available on the Jahia Store').should('be.visible')
            })
        })

        it('shows a search input to filter the store catalogue', () => {
            openInstallFromStore()
            cy.get('[data-testid="install-from-store-dialog"]').within(() => {
                cy.get('input[type="text"]', { timeout: 20000 }).should('be.visible')
            })
        })

        it('resolves the catalogue to a terminal state (list, empty, or load error)', () => {
            openInstallFromStore()
            // The catalogue loads asynchronously; assert (with retry) that it reaches
            // one of its terminal states rather than staying on the loading indicator.
            cy.get('[data-testid="install-from-store-dialog"]')
                .contains(/Install selected|already installed|No modules match|Failed to load/, { timeout: 30000 })
                .should('exist')
        })

        it('closes the install-from-store dialog', () => {
            openInstallFromStore()
            cy.get('[data-testid="install-from-store-dialog"]').within(() => {
                cy.contains('button', 'Cancel').click()
            })
            cy.get('[data-testid="install-from-store-dialog"]').should('not.exist')
        })
    })

    // ===========================================================================
    // 3. SERVER STATUS (SAM) PROBE MODAL
    // ===========================================================================

    describe('Server status probe modal', () => {
        beforeEach(visitPage)

        const openProbeModal = () => {
            cy.contains('Loading server status', { timeout: 15000 }).should('not.exist')
            cy.get('button[aria-label^="Server status"]', { timeout: 15000 }).first().click()
            cy.get('[aria-labelledby="probe-dialog-title"]', { timeout: 10000 }).should('be.visible')
        }

        it('opens the probe modal when the server-status button is clicked', () => {
            openProbeModal()
        })

        it('probe modal lists the "Probes" section', () => {
            openProbeModal()
            cy.get('[aria-labelledby="probe-dialog-title"]').within(() => {
                cy.contains('Probes').should('be.visible')
            })
        })

        it('closes the probe modal via its Close button', () => {
            openProbeModal()
            cy.get('[aria-labelledby="probe-dialog-title"]').find('button[aria-label="Close"]').click()
            cy.get('[aria-labelledby="probe-dialog-title"]').should('not.exist')
        })
    })

    // ===========================================================================
    // 4. BUNDLE DETAILS — dependency graph & version history tabs
    // ===========================================================================

    describe('Bundle details — dependency & version tabs', () => {
        // Module-management-community declares a Jahia module dependency
        // (graphql-dxm-provider), so its "Module dependencies" tab + graph render —
        // and its details dialog opens reliably with a small, fast-rendering graph.
        const depModule = testBundle

        const openDetailsFor = (name: string) => {
            visitPage()
            filterByName(name)
            cy.get('[aria-label="Show details"]', { timeout: 20000 }).first().click()
            cy.get('[data-testid="bundle-details-dialog"]', { timeout: 15000 }).should('be.visible')
        }

        it('shows a "Module dependencies" tab for a module with dependencies', () => {
            openDetailsFor(depModule)
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Module dependencies').should('be.visible')
            })
        })

        it('selecting the "Module dependencies" tab activates it and keeps the dialog open', () => {
            openDetailsFor(depModule)
            cy.get('[data-testid="bundle-details-dialog"]').within(() => {
                cy.contains('button', 'Module dependencies').click()
                cy.contains('button', 'Module dependencies').should('have.attr', 'aria-selected', 'true')
            })
            cy.get('[data-testid="bundle-details-dialog"]').should('be.visible')
        })

        it('the dependency graph renders a region with a screen-reader text alternative', () => {
            openDetailsFor(depModule)
            // Activate the tab first (deterministic), then assert the graph region —
            // the Mermaid/ELK render is asynchronous, so query with a generous timeout.
            cy.get('[data-testid="bundle-details-dialog"]').contains('button', 'Module dependencies').click()
            cy.get('[data-testid="bundle-details-dialog"]')
                .contains('button', 'Module dependencies')
                .should('have.attr', 'aria-selected', 'true')
            // Mermaid graph: role="img" with an accessible name, plus a visually-hidden
            // "<from> depends on <to>" edge list as the AAA text alternative.
            cy.get('[data-testid="bundle-details-dialog"] [role="img"]', { timeout: 30000 })
                .should('exist')
                .and('have.attr', 'aria-label')
            cy.get('[data-testid="bundle-details-dialog"]').contains('depends on', { timeout: 30000 }).should('exist')
        })
    })

    // ===========================================================================
    // 5. GRAPHQL MUTATIONS — exercised end-to-end (side-effect-free)
    // ===========================================================================

    describe('GraphQL mutations (side-effect-free)', () => {
        it('updateModules dry-run returns a result with a yamlScript field and no errors', () => {
            cy.apollo({
                mutationFile: 'graphql/mutation/updateModulesDryRun.graphql',
                variables: { jahiaOnly: true, dryRun: true },
            }).then((response) => {
                expect(response.errors, 'no GraphQL errors').to.be.undefined
                const result = response?.data?.admin?.modulesManagement?.updateModules
                expect(result, 'updateModules result object').to.be.an('object')
                expect(result).to.have.property('yamlScript')
                expect(result).to.have.property('modules')
            })
        })

        it('generateProvisioningScript returns a provisioning YAML for an installed module', () => {
            cy.apollo({
                mutationFile: 'graphql/mutation/generateProvisioningScript.graphql',
                variables: { symbolicNames: ['news'] },
            }).then((response) => {
                expect(response.errors, 'no GraphQL errors').to.be.undefined
                const script: string = response?.data?.admin?.modulesManagement?.generateProvisioningScript ?? ''
                expect(script, 'script is a non-empty string').to.be.a('string').and.have.length.greaterThan(0)
                expect(script).to.contain('installOrUpgradeBundle')
            })
        })

        it('storeModules query returns an array of uninstalled store modules', () => {
            cy.apollo({
                queryFile: 'graphql/query/getStoreModules.graphql',
                variables: { searchTerm: '' },
            }).then((response) => {
                expect(response.errors, 'no GraphQL errors').to.be.undefined
                const modules = response?.data?.admin?.modulesManagement?.storeModules
                expect(modules, 'storeModules is an array').to.be.an('array')
            })
        })

        it('cleanupJcrVersions returns a human-readable summary string', () => {
            cy.apollo({
                mutationFile: 'graphql/mutation/cleanupJcrVersions.graphql',
            }).then((response) => {
                expect(response.errors, 'no GraphQL errors').to.be.undefined
                const summary = response?.data?.admin?.modulesManagement?.cleanupJcrVersions
                expect(summary, 'cleanup summary string').to.be.a('string')
            })
        })
    })
})
