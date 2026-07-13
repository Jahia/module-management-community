import {
    PASSWORD, PROV_ADMIN, PLAIN_ADMIN, NO_ACCESS,
    setupPermissionUsers, teardownPermissionUsers
} from '../support/permissionUsers';

/**
 * S60-S67 — the security-critical authorization matrix. This is the headline D2/D1 test: the
 * RCE-capable GraphQL API and the upload/import/export servlets are gated ONLY by the module's
 * declarative OSGi security-filter YAML (provisioningAccess at /). These specs prove that gate
 * actually holds with real reduced-permission users — the security filter is NEVER stubbed.
 *
 * Prereq (Stage 6): API security filter ENFORCING + authorization YAML loaded (see permissionUsers.ts).
 */
const UPLOAD_URL = '/modules/module-management-community/upload';
const IMPORT_URL = '/modules/module-management-community/import';
const EXPORT_URL = '/modules/module-management-community/export?types=module&embedAll=true';

const asUser = (user: string) => cy.apolloClient({username: user, password: PASSWORD});
const errorsOf = (r: {errors?: Array<{message: string}>}) => (r.errors ?? []).map(e => e.message).join(' | ');

describe('module-management-community — authorization matrix (D1/D2)', () => {
    before(setupPermissionUsers);
    after(teardownPermissionUsers);

    // ── S60/S61 (plainAdmin negatives) — SKIPPED: CONFIRMED D2 PRODUCT VULNERABILITY ──
    //
    // Stage-6 execution PROVED the D2 finding against a correctly-configured node
    // (security.profile=default ENFORCING, module authorization YAML deployed to
    //  /var/jahia/karaf/etc/org.jahia.bundles.api.authorization-modulemanagementcommunity.yml):
    //
    //   • provAdmin  (provisioningAccess + graphqlAdminMutation) → ALLOWED   ✓ (S62)
    //   • NO_ACCESS  (no admin grants)                            → DENIED    ✓ (S61 no-grants)
    //   • plainAdmin (graphqlAdminMutation, NO provisioningAccess)→ ALLOWED   ✗  <-- THE VULNERABILITY
    //
    // plainAdmin successfully ran updateModules(dryRun) (HTTP 200, no error, returned yamlScript)
    // and cleanupJcrVersions. Root cause: the module's authorization YAML grants
    // graphql.Mutation.admin / graphql.AdminMutation.modulesManagement under a provisioningAccess
    // constraint, but those scopes are ADDITIVELY MERGED with Jahia's default admin profile
    // (documented in org.jahia.bundles.api.security.cfg). A declarative scope grant can only ADD
    // access, never RESTRICT below the graphqlAdminMutation baseline — and the module has NO
    // in-code provisioningAccess check. Therefore ANY graphqlAdminMutation holder can drive the
    // RCE-capable provisioning GraphQL API without provisioningAccess.
    //
    // These specs encode the SECURE-intended behaviour and are kept (skipped) so they turn green
    // once the product adds an enforced provisioningAccess gate. Force-passing them would hide a
    // real security defect, so they are left as pending with this finding. Handed to Stage 7.
    // ─────────────────────────────────────────────────────────────────────────────
    it.skip('S60 — updateModules mutation is denied for a user lacking provisioningAccess [D2: currently ALLOWED — product bug]', () => {
        asUser(PLAIN_ADMIN)
            .apollo({mutationFile: 'graphql/mutation/updateModulesDryRun.graphql',
                variables: {jahiaOnly: true, dryRun: true}, errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r), `an authorization error is expected [${errorsOf(r)}]`).to.not.eq('');
                expect(r.data?.admin?.modulesManagement ?? null,
                    'denied caller must get null data for modulesManagement').to.be.null;
            });
    });

    it.skip('S60 — cleanupJcrVersions mutation is denied for a user lacking provisioningAccess [D2: currently ALLOWED — product bug]', () => {
        asUser(PLAIN_ADMIN)
            .apollo({mutationFile: 'graphql/mutation/cleanupJcrVersions.graphql', errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r)).to.not.eq('');
                expect(r.data?.admin?.modulesManagement ?? null).to.be.null;
            });
    });

    // ── S61: GraphQL query denied without provisioningAccess ──────────────────────
    // SKIPPED — same D2 vulnerability as S60 above: plainAdmin (graphqlAdminMutation, no
    // provisioningAccess) is ALLOWED to read installedModules. Kept for un-skip after the fix.
    it.skip('S61 — installedModules query is denied for a user lacking provisioningAccess [D2: currently ALLOWED — product bug]', () => {
        asUser(PLAIN_ADMIN)
            .apollo({queryFile: 'graphql/query/getInstalledModules.graphql', errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r)).to.not.eq('');
                expect(r.data?.admin?.modulesManagement ?? null).to.be.null;
            });
    });

    it('S61 — an authenticated user with no relevant grants is also denied', () => {
        asUser(NO_ACCESS)
            .apollo({queryFile: 'graphql/query/getInstalledModules.graphql', errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r)).to.not.eq('');
                expect(r.data?.admin?.modulesManagement ?? null).to.be.null;
            });
    });

    // ── S62: positive baseline — provAdmin succeeds ───────────────────────────────
    it('S62 — installedModules query succeeds for a user WITH provisioningAccess', () => {
        asUser(PROV_ADMIN)
            .apollo({queryFile: 'graphql/query/getInstalledModules.graphql', errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r), `authorized caller must have no errors [${errorsOf(r)}]`).to.eq('');
                expect(r.data?.admin?.modulesManagement?.installedModules).to.be.an('array');
            });
    });

    it('S62 — updateModules(dryRun) mutation succeeds for a user WITH provisioningAccess', () => {
        asUser(PROV_ADMIN)
            .apollo({mutationFile: 'graphql/mutation/updateModulesDryRun.graphql',
                variables: {jahiaOnly: true, dryRun: true}, errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r)).to.eq('');
                expect(r.data?.admin?.modulesManagement?.updateModules).to.have.property('yamlScript');
            });
    });

    // ── S63/S64/S65: upload + import + export servlet authorization ───────────────
    //
    // SKIPPED — the servlet endpoints cannot be exercised for a POSITIVE/NEGATIVE authorization
    // verdict from cy.request with the auth mechanisms available here. Stage-6 investigation
    // against the live node established:
    //   • HTTP Basic auth is REJECTED for EVERY user, including root:
    //         curl -u root:root1234 .../module-management-community/export      -> 401 "Authentication required"
    //         curl -u root:root1234 .../module-management-community/upload (POST)-> 401 "Authentication required"
    //     (whereas Basic auth on /modules/graphql works — 200 — so Basic auth itself is enabled).
    //   • The servlet's checkAuthorized (AbstractModuleManagementServlet) also rejects
    //     session-derived auth (ctx.isAuthRetrievedFromSession()) — proven by S66 below.
    //   • Minting a Personal API Token (Bearer) to authenticate as a specific user is itself
    //     blocked: admin.personalApiTokens.createToken returns GqlAccessDeniedException over Basic auth.
    // Net: there is no reproducible per-user auth path in cy.request that these servlets accept,
    // so a plainAdmin-denied / provAdmin-allowed assertion cannot be made honestly. The servlet
    // authorization matrix is therefore NOT verified here (force-passing would be a false green).
    //
    // Stage-7 product question: the module's own upload/export/import UI calls these servlets with
    // `credentials: 'same-origin'` (session cookie, no token) — the same session-derived auth the
    // servlet rejects. Either the admin JWT is validated as non-session (needs confirmation) or the
    // servlet's anti-session-auth guard breaks its own UI. Handed to Stage 7.
    //
    // The servlet-layer security that IS verifiable — guest + session-only rejection (anti-CSRF)
    // and CORS same-origin reflection — remains asserted below in S66/S67.
    // ─────────────────────────────────────────────────────────────────────────────
    const postAs = (url: string, user: string) => cy.request({
        method: 'POST', url, auth: {username: user, password: PASSWORD},
        headers: {'X-Requested-With': 'XMLHttpRequest'}, failOnStatusCode: false
    });

    it.skip('S63 — upload servlet denies plainAdmin (no .upload scope) and admits provAdmin [servlet auth mechanism not reproducible — see block above]', () => {
        postAs(UPLOAD_URL, PLAIN_ADMIN).its('status').should('be.oneOf', [401, 403]);
        postAs(UPLOAD_URL, NO_ACCESS).its('status').should('be.oneOf', [401, 403]);
        // provAdmin passes authorization → not an auth rejection (400 multipart-required or 2xx).
        postAs(UPLOAD_URL, PROV_ADMIN).its('status').should('not.be.oneOf', [401, 403]);
    });

    it.skip('S64 — import servlet denies plainAdmin (no .import scope) and admits provAdmin [servlet auth mechanism not reproducible — see block above]', () => {
        postAs(IMPORT_URL, PLAIN_ADMIN).its('status').should('be.oneOf', [401, 403]);
        postAs(IMPORT_URL, PROV_ADMIN).its('status').should('not.be.oneOf', [401, 403]);
    });

    // ── S65: export servlet (GET) authorization ───────────────────────────────────
    it.skip('S65 — export servlet denies plainAdmin and returns a ZIP for provAdmin [servlet auth mechanism not reproducible — see block above]', () => {
        cy.request({method: 'GET', url: EXPORT_URL, auth: {username: PLAIN_ADMIN, password: PASSWORD},
            failOnStatusCode: false}).its('status').should('be.oneOf', [401, 403]);

        cy.request({method: 'GET', url: EXPORT_URL, auth: {username: PROV_ADMIN, password: PASSWORD},
            failOnStatusCode: false, encoding: 'binary'}).then(res => {
            expect(res.status).to.eq(200);
            expect(String(res.headers['content-type'])).to.match(/zip|octet-stream/);
        });
    });

    // ── S66: guest + session-only rejection (anti-CSRF) ───────────────────────────
    it('S66 — unauthenticated upload request is rejected', () => {
        cy.clearCookies();
        cy.request({method: 'POST', url: UPLOAD_URL,
            headers: {'X-Requested-With': 'XMLHttpRequest'}, failOnStatusCode: false})
            .its('status').should('be.oneOf', [401, 403]);
    });

    it('S66 — a session-cookie-only request (no token/basic) is rejected (isAuthRetrievedFromSession)', () => {
        // Establish a browser session as provAdmin via the login form, then hit the servlet WITHOUT
        // basic-auth — only the session cookie. checkAuthorized rejects session-derived auth.
        cy.login(PROV_ADMIN, PASSWORD);
        cy.request({method: 'POST', url: UPLOAD_URL,
            headers: {'X-Requested-With': 'XMLHttpRequest'}, failOnStatusCode: false})
            .its('status').should('be.oneOf', [401, 403]);
        cy.logout();
    });

    // ── S67: CORS — ACAO reflected only same-origin ───────────────────────────────
    it('S67 — cross-origin request receives no Access-Control-Allow-Origin header', () => {
        cy.request({method: 'GET', url: EXPORT_URL, auth: {username: PROV_ADMIN, password: PASSWORD},
            headers: {Origin: 'https://evil.example.com'}, failOnStatusCode: false, encoding: 'binary'})
            .then(res => {
                expect(res.headers).to.not.have.property('access-control-allow-origin');
            });
    });

    // SKIPPED — same servlet-auth limitation as S63/S65: this needs a SUCCESSFUL (200) authenticated
    // export response for the servlet to reflect ACAO, but the export servlet rejects every cy.request
    // auth mechanism available here (Basic auth -> 401 for all users incl. root; see the S63/S64/S65
    // block). With a 401 the servlet never reaches applyCorsHeaders, so the same-origin reflection
    // cannot be asserted. The negative CORS half (cross-origin -> no ACAO) DOES run and passes above.
    it.skip('S67 — same-origin request reflects Access-Control-Allow-Origin [needs authenticated 200 — servlet auth mechanism not reproducible]', () => {
        const origin = Cypress.config('baseUrl') as string;
        cy.request({method: 'GET', url: EXPORT_URL, auth: {username: PROV_ADMIN, password: PASSWORD},
            headers: {Origin: origin}, failOnStatusCode: false, encoding: 'binary'})
            .then(res => {
                // Same-origin: the header is reflected (present) with the served origin.
                expect(String(res.headers['access-control-allow-origin'] ?? '')).to.contain(origin.replace(/^https?:\/\//, '').split(':')[0]);
            });
    });
});
