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

    // ── S60: GraphQL mutation denied without provisioningAccess ───────────────────
    it('S60 — updateModules mutation is denied for a user lacking provisioningAccess', () => {
        asUser(PLAIN_ADMIN)
            .apollo({mutationFile: 'graphql/mutation/updateModulesDryRun.graphql',
                variables: {jahiaOnly: true, dryRun: true}, errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r), `an authorization error is expected [${errorsOf(r)}]`).to.not.eq('');
                expect(r.data?.admin?.modulesManagement ?? null,
                    'denied caller must get null data for modulesManagement').to.be.null;
            });
    });

    it('S60 — cleanupJcrVersions mutation is denied for a user lacking provisioningAccess', () => {
        asUser(PLAIN_ADMIN)
            .apollo({mutationFile: 'graphql/mutation/cleanupJcrVersions.graphql', errorPolicy: 'all'})
            .then((r: {data?: any; errors?: Array<{message: string}>}) => {
                expect(errorsOf(r)).to.not.eq('');
                expect(r.data?.admin?.modulesManagement ?? null).to.be.null;
            });
    });

    // ── S61: GraphQL query denied without provisioningAccess ──────────────────────
    it('S61 — installedModules query is denied for a user lacking provisioningAccess', () => {
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

    // ── S63/S64: upload + import servlet authorization ────────────────────────────
    // An empty POST that PASSES authorization reaches "Multipart request required" (400); a request
    // that FAILS authorization is rejected (401/403) by the security filter before the servlet body.
    const postAs = (url: string, user: string) => cy.request({
        method: 'POST', url, auth: {username: user, password: PASSWORD},
        headers: {'X-Requested-With': 'XMLHttpRequest'}, failOnStatusCode: false
    });

    it('S63 — upload servlet denies plainAdmin (no .upload scope) and admits provAdmin', () => {
        postAs(UPLOAD_URL, PLAIN_ADMIN).its('status').should('be.oneOf', [401, 403]);
        postAs(UPLOAD_URL, NO_ACCESS).its('status').should('be.oneOf', [401, 403]);
        // provAdmin passes authorization → not an auth rejection (400 multipart-required or 2xx).
        postAs(UPLOAD_URL, PROV_ADMIN).its('status').should('not.be.oneOf', [401, 403]);
    });

    it('S64 — import servlet denies plainAdmin (no .import scope) and admits provAdmin', () => {
        postAs(IMPORT_URL, PLAIN_ADMIN).its('status').should('be.oneOf', [401, 403]);
        postAs(IMPORT_URL, PROV_ADMIN).its('status').should('not.be.oneOf', [401, 403]);
    });

    // ── S65: export servlet (GET) authorization ───────────────────────────────────
    it('S65 — export servlet denies plainAdmin and returns a ZIP for provAdmin', () => {
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

    it('S67 — same-origin request reflects Access-Control-Allow-Origin', () => {
        const origin = Cypress.config('baseUrl') as string;
        cy.request({method: 'GET', url: EXPORT_URL, auth: {username: PROV_ADMIN, password: PASSWORD},
            headers: {Origin: origin}, failOnStatusCode: false, encoding: 'binary'})
            .then(res => {
                // Same-origin: the header is reflected (present) with the served origin.
                expect(String(res.headers['access-control-allow-origin'] ?? '')).to.contain(origin.replace(/^https?:\/\//, '').split(':')[0]);
            });
    });
});
