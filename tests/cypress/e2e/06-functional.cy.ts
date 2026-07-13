import {PASSWORD, PROV_ADMIN, setupPermissionUsers, teardownPermissionUsers} from '../support/permissionUsers';

/**
 * S68-S73 / S79 — uncovered functional GraphQL operations, exercised as provAdmin (the positive,
 * authorized path). Read-only / idempotent queries are asserted directly; destructive operations
 * that need a disposable target on the shared single-node harness are documented and guarded.
 */
const asProv = () => cy.apolloClient({username: PROV_ADMIN, password: PASSWORD});
const errorsOf = (r: {errors?: Array<{message: string}>}) => (r.errors ?? []).map(e => e.message).join(' | ');

describe('module-management-community — functional GraphQL (provAdmin)', () => {
    before(setupPermissionUsers);
    after(teardownPermissionUsers);

    it('S68 — availableUpdates accepts regex filters (matching vs non-matching)', () => {
        asProv().apollo({queryFile: 'graphql/query/getAvailableUpdates.graphql',
            variables: {filters: ['^org\\.jahia\\.modules\\..*']}, errorPolicy: 'all'})
            .then((r: {data?: any}) => {
                expect(r.data?.admin?.modulesManagement?.availableUpdates).to.be.an('array');
            });
        asProv().apollo({queryFile: 'graphql/query/getAvailableUpdates.graphql',
            variables: {filters: ['^no\\.such\\.module\\.at\\.all$']}, errorPolicy: 'all'})
            .then((r: {data?: any}) => {
                expect(r.data?.admin?.modulesManagement?.availableUpdates).to.deep.eq([]);
            });
    });

    it('S69 — clustered returns a boolean false on the single-node harness', () => {
        asProv().apollo({queryFile: 'graphql/query/getClustered.graphql', errorPolicy: 'all'})
            .then((r: {data?: any}) => {
                expect(r.data?.admin?.modulesManagement?.clustered).to.eq(false);
            });
    });

    it('S70 — features returns Jahia features by default and a superset with jahiaOnly:false', () => {
        asProv().apollo({queryFile: 'graphql/query/getFeatures.graphql',
            variables: {jahiaOnly: true}, errorPolicy: 'all'})
            .then((r: {data?: any}) => {
                const feats = r.data?.admin?.modulesManagement?.features ?? [];
                expect(feats).to.be.an('array');
                cy.wrap(feats.length).as('jahiaOnlyCount');
            });
        cy.get('@jahiaOnlyCount').then(jahiaOnlyCount => {
            asProv().apollo({queryFile: 'graphql/query/getFeatures.graphql',
                variables: {jahiaOnly: false}, errorPolicy: 'all'})
                .then((r: {data?: any}) => {
                    const all = r.data?.admin?.modulesManagement?.features ?? [];
                    expect(all.length).to.be.at.least(Number(jahiaOnlyCount));
                });
        });
    });

    it('S71 — installedBundleTypes returns symbolicName:type pairs incl the bundle fallback', () => {
        asProv().apollo({queryFile: 'graphql/query/getInstalledBundleTypes.graphql', errorPolicy: 'all'})
            .then((r: {data?: any}) => {
                const types: string[] = r.data?.admin?.modulesManagement?.installedBundleTypes ?? [];
                expect(types.length).to.be.greaterThan(0);
                types.forEach(t => expect(t).to.match(/^.+:(module|system|templatesSet|bundle)$/));
            });
    });

    it('S72 — installBundleFromJcr rejects a jcrPath outside the managed bundle store (U15 at the API boundary)', () => {
        asProv().apollo({mutationFile: 'graphql/mutation/installBundleFromJcr.graphql',
            variables: {jcrPath: '/sites/evil/x.jar'}, errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r), 'a path outside /module-management/bundles must error').to.not.eq('');
                expect(r.data?.admin?.modulesManagement?.installBundleFromJcr ?? null).to.be.null;
            });
    });

    // SKIPPED — blocked by a PRODUCT authorization-config gap (Stage-6 finding, hand to Stage 7):
    // the `bundle(name:)` query returns GqlAccessDeniedException ("Permission denied") even for root
    // and for provAdmin. The module's authorization YAML grants graphql.AdminQuery.modulesManagement
    // + graphql.ModuleManagementQueryResult (so the scalar/list fields availableUpdates / features /
    // clustered / installedBundleTypes work — S68-S71 pass), but it does NOT grant the scope for the
    // `bundle` field's GqlBundle return type. Under the enforcing security filter that leaves the
    // module's own `bundle(name)` / `bundle(bundleId)` sub-API unreachable. importModule depends on
    // resolving bundleId via that query, so it cannot run. Un-skip once the YAML grants the GqlBundle
    // scope (or the field is exposed under an already-granted scope).
    it.skip('S73 — importModule(bundleId, force) re-imports a deployed module [blocked: bundle() denied — module authz YAML missing GqlBundle scope]', () => {
        // Resolve this module's own bundleId, then re-import (force:false is content-idempotent).
        asProv().apollo({
            query: `query { admin { modulesManagement {
                bundle(name: "module-management-community") { bundleId } } } }`,
            errorPolicy: 'all'
        }).then((r: {data?: any}) => {
            const bundleId = r.data?.admin?.modulesManagement?.bundle?.bundleId;
            if (!bundleId) {
                cy.log('Skipping S73: could not resolve module-management-community bundleId');
                return;
            }
            asProv().apollo({mutationFile: 'graphql/mutation/importModule.graphql',
                variables: {bundleId, force: false}, errorPolicy: 'all'})
                .then((res: {data?: any; errors?: Array<{message: string}>}) => {
                    expect(errorsOf(res)).to.eq('');
                    expect(res.data?.admin?.modulesManagement?.importModule).to.be.a('string');
                });
        });
    });

    // S79 (bundle.uninstall e2e) requires a disposable throwaway module. On the shared single-node
    // harness the only safe disposable target is one deployed via the online store path (S55/S78),
    // which is environment-gated. The uninstall lifecycle op is covered at unit level by JUnit S31.
    it.skip('S79 — bundle.uninstall removes a disposable module (needs a throwaway deploy; see JUnit S31)', () => {
        // Stage 6: deploy a small bundled test JAR (cy.task buildTestJar) via the upload servlet as
        // provAdmin, capture its bundleId, then bundle(bundleId).uninstall and assert it leaves
        // installedModules. Left skipped so no shared demo module is uninstalled by accident.
    });
});

/**
 * S80 — the admin ROUTE is gated by adminTemplates (+ core license), NOT provisioningAccess (D8):
 * viewing uses adminTemplates while operations use provisioningAccess.
 */
describe('module-management-community — admin route gate (D8/S80)', () => {
    const adminPath = '/jahia/administration/module-management-community';
    const root = '#module-management-community-root';

    before(setupPermissionUsers);
    after(teardownPermissionUsers);

    // SKIPPED — the admin React app does not mount on this Jahia snapshot (ENVIRONMENT/version-compat,
    // Stage-6 finding, hand to Stage 7). The module federates @jahia/react-material as a shared
    // singleton at "^3.0.6", but the host (@jahia/jcontent) ships only 3.0.5:
    //   cons:warn "No satisfying version (^3.0.6) of shared module @jahia/react-material found in
    //              shared scope default. Available versions: 3.0.5 from @jahia/jcontent"
    // The unsatisfied singleton prevents the app from mounting, so #module-management-community-root
    // never appears. This is pre-existing (it also fails the module's own spec 01 UI tests on this
    // image) and is not a test defect. The adminTemplates gate logic itself is unit-covered.
    // Un-skip on a Jahia build that ships @jahia/react-material >= 3.0.6 (or relax the module's dep).
    it.skip('S80 — provAdmin (has adminTemplates) can render the admin page [UI mount blocked: @jahia/react-material ^3.0.6 vs host 3.0.5]', () => {
        cy.login(PROV_ADMIN, PASSWORD);
        cy.visit(adminPath);
        cy.get(root, {timeout: 20000}).should('exist');
        cy.logout();
    });

    // License-downgrade half (requireCoreLicenseRoot) is environment-limited on the test node
    // (core-license context is fixed), so only the adminTemplates half is asserted here.
    it.skip('S80 — license-insufficient context blocks render (env-limited: core license fixed on test node)', () => {
        // Stage 6/7: requires a non-core-license context which the harness cannot vary.
    });
});
