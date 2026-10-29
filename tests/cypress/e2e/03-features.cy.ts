/**
 * End-to-end tests for module-management-community features that complement
 * specs 01 (page/table/details) and 02 (upload/export/generate-script):
 *
 *  - Accessibility structure (WCAG 2.2 AAA work): main landmark, h1, sortable
 *    column headers with aria-sort, dialog accessible names.
 *  - Install-from-store dialog (store catalogue browse).
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

    /** Type a name in the Name filter chip, then close its editor */
    const filterByName = (name: string) => {
        cy.get('[data-testid="filter-chip"][data-filter="name"] [data-testid="filter-chip-edit"]').click()
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).clear()
        cy.get(`input[placeholder="${nameFilterPlaceholder}"]`).type(name)
        cy.get('[data-testid="filter-editor-close"]').click()
    }

    /** The details dialog opens from the ⋮ menu of the first row, which always shows */
    const openFirstRowDetails = () => {
        cy.get('[data-testid="row-actions-menu-btn"]', { timeout: 20000 }).first().click()
        cy.get('[data-testid="row-menu-details"]').click()
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

        it('marks the sorted column header with aria-sort', () => {
            cy.get('th[aria-sort]').should('have.length.at.least', 1)
        })

        it('clicking the Module name header toggles its aria-sort state', () => {
            cy.contains('th', 'Module name').should('have.attr', 'aria-sort', 'ascending')
            cy.contains('th', 'Module name').click()
            cy.contains('th', 'Module name').should('have.attr', 'aria-sort', 'descending')
        })

        it('gives the bundle details dialog an accessible name (resolved aria-labelledby)', () => {
            filterByName(testBundle)
            cy.get('[data-testid="pagination-total-items"]').should('have.text', '1-1 of 1')
            openFirstRowDetails()
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
            cy.get('[data-testid="install-from-store-btn"]').click()
            cy.get('[data-testid="install-from-store-dialog"]', { timeout: 20000 }).should('be.visible')
        }

        it('shows the "Install from store" button in the action bar', () => {
            cy.get('[role="toolbar"]').contains('button', 'Install from store').should('be.visible')
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
    // 3. BUNDLE DETAILS — dependency graph & version history tabs
    // ===========================================================================

    describe('Bundle details — dependency & version tabs', () => {
        // Exercises the "Bundle dependencies" tab, NOT "Module dependencies".
        //
        // The original comment here claimed module-management-community declares a Jahia module
        // dependency on graphql-dxm-provider, so the "Module dependencies" tab would render. That
        // is false: graphql-dxm-provider is a Maven `provided` dependency (compile-time only). The
        // built manifest carries no Jahia-Depends header and requires no com.jahia.modules
        // .dependencies capability, so GqlBundle#getModuleDependencyGraph — which walks exactly
        // that namespace — returns a mermaid header with no '-->' edges, and BundleDetails' TABS
        // condition correctly hides the tab. The tests only ever passed when the pre-filter
        // `.first()` click opened some OTHER bundle's dialog.
        //
        // getDependencyGraph walks osgi.wiring.package instead, which this module has in
        // abundance, so "Bundle dependencies" is the tab that genuinely renders here. It serves
        // the same purpose for this block: a graph tab that activates and exposes the Mermaid
        // render with its screen-reader text alternative.
        const depModule = testBundle

        // Re-resolved from the document on every retry, deliberately.
        //
        // The tab list is built from bundle data that arrives after the dialog is already
        // visible (BundleDetails TABS: `condition: b => b.moduleDependenciesGraph?.includes('-->')`),
        // so React replaces the dialog subtree once it lands. Capturing the dialog first —
        // with `.within()` or with `cy.get(dialog).contains(...)` — pins a subject to the
        // pre-data render, and Cypress then retries against a detached node: it reports
        // either "No elements in the current DOM matched" or an internal
        // "Cannot read properties of undefined (reading 'selector')" while describing the
        // stale subject. Both were observed in the same run in which the sibling assertion
        // passed. A single `cy.contains(selector, content)` has no captured parent, so each
        // retry starts from the live DOM.
        const bundleDepsTab = () =>
            cy.contains('[data-testid="bundle-details-dialog"] button', 'Bundle dependencies', {timeout: 20000})

        // Mirrors the sequence spec 01 uses at "opens the bundle details dialog", which passes
        // reliably. The name filter re-renders the table, so the table must be OBSERVED to
        // reduce to the single matching row before anything is clicked. Clicking straight after
        // typing lands on a row the table is about to replace and the click is silently
        // swallowed — the failure screenshots show the filter correctly reduced to one row with
        // no dialog open at all, which is that swallowed click and not a slow render.
        const openDetailsFor = (name: string) => {
            visitPage()
            filterByName(name)
            cy.get('[data-testid="pagination-total-items"]', {timeout: 20000}).should('have.text', '1-1 of 1')
            openFirstRowDetails()
            // Assert the dialog's CONTENT, not merely its presence: it proves the right bundle's
            // dialog opened, which a bare presence check cannot.
            cy.contains('[data-testid="bundle-details-dialog"]', name, {timeout: 15000}).should('be.visible')
            // Settle on the tab too: a visible dialog does not imply the dependency data has
            // arrived, and every assertion below depends on it.
            bundleDepsTab().should('be.visible')
        }

        it('shows a "Bundle dependencies" tab for a module with dependencies', () => {
            openDetailsFor(depModule)
            bundleDepsTab().should('be.visible')
        })

        it('selecting the "Bundle dependencies" tab activates it and keeps the dialog open', () => {
            openDetailsFor(depModule)
            bundleDepsTab().click()
            bundleDepsTab().should('have.attr', 'aria-selected', 'true')
            cy.get('[data-testid="bundle-details-dialog"]').should('be.visible')
        })

        it('the dependency graph renders a region with a screen-reader text alternative', () => {
            openDetailsFor(depModule)
            // Activate the tab first (deterministic), then assert the graph region —
            // the Mermaid/ELK render is asynchronous, so query with a generous timeout.
            bundleDepsTab().click()
            bundleDepsTab().should('have.attr', 'aria-selected', 'true')
            // Mermaid graph: role="img" with an accessible name, plus a visually-hidden
            // "<from> depends on <to>" edge list as the AAA text alternative.
            cy.get('[data-testid="bundle-details-dialog"] [role="img"]', { timeout: 30000 })
                .should('exist')
                .and('have.attr', 'aria-label')
            cy.get('[data-testid="bundle-details-dialog"]').contains('depends on', { timeout: 30000 }).should('exist')
        })
    })

    // ===========================================================================
    // 4. GRAPHQL MUTATIONS — exercised end-to-end (side-effect-free)
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
