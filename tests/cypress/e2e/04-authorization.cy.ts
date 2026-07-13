import {
    PASSWORD,
    PROV_ADMIN,
    PLAIN_ADMIN,
    NO_ACCESS,
    setupPermissionUsers,
    teardownPermissionUsers,
} from '../support/permissionUsers'

/**
 * S60-S67 — the security-critical authorization matrix (D1/D2), now asserting the SECURE behaviour
 * after the Stage-7 product fixes:
 *
 *  • D2 (GraphQL): the modulesManagement Query/Mutation namespaces now enforce provisioningAccess
 *    in-code (ProvisioningAccessGuard) — the declarative security-filter scope alone could not
 *    restrict below the graphqlAdminQuery/Mutation baseline. So a user WITH graphqlAdminMutation but
 *    WITHOUT provisioningAccess (plainAdmin) is now DENIED (before the fix it was ALLOWED — the bug).
 *  • Servlets: checkAuthorized no longer rejects session-derived auth; the module's admin UI calls
 *    the endpoints same-origin with a session cookie, and the origin-scoped, provisioningAccess-
 *    constrained API scope enforces CSRF (same-origin) + permission. So provAdmin (session) is
 *    ALLOWED, plainAdmin (no provisioningAccess) is DENIED, cross-origin / unauthenticated DENIED.
 *
 * The security filter is NEVER stubbed. Prereq: API security filter ENFORCING + module authorization
 * YAML loaded (see permissionUsers.ts).
 */
const UPLOAD_URL = '/modules/module-management-community/upload'
const IMPORT_URL = '/modules/module-management-community/import'
const EXPORT_URL = '/modules/module-management-community/export?types=module&embedAll=true'

const asUser = (user: string) => cy.apolloClient({ username: user, password: PASSWORD })
const errorsOf = (r: { errors?: Array<{ message: string }> }) => (r.errors ?? []).map((e) => e.message).join(' | ')

describe('module-management-community — authorization matrix (D1/D2)', () => {
    before(setupPermissionUsers)
    after(teardownPermissionUsers)

    // ── S60/S61 (plainAdmin negatives) — the D2 fix, proven by inversion ──────────
    // Before the fix these PASSED (plainAdmin was ALLOWED — the vulnerability). After adding the
    // in-code provisioningAccess gate they assert a genuine authorization denial.
    it('S60 — updateModules mutation is DENIED for a user lacking provisioningAccess [D2 fixed]', () => {
        asUser(PLAIN_ADMIN)
            .apollo({
                mutationFile: 'graphql/mutation/updateModulesDryRun.graphql',
                variables: { jahiaOnly: true, dryRun: true },
                errorPolicy: 'all',
            })
            .then((r: { data?: any; errors?: Array<{ message: string }> }) => {
                expect(errorsOf(r), `an authorization error is expected [${errorsOf(r)}]`).to.not.eq('')
                expect(
                    r.data?.admin?.modulesManagement ?? null,
                    'denied caller must get null data for modulesManagement',
                ).to.be.null
            })
    })

    it('S60 — cleanupJcrVersions mutation is DENIED for a user lacking provisioningAccess [D2 fixed]', () => {
        asUser(PLAIN_ADMIN)
            .apollo({ mutationFile: 'graphql/mutation/cleanupJcrVersions.graphql', errorPolicy: 'all' })
            .then((r: { data?: any; errors?: Array<{ message: string }> }) => {
                expect(errorsOf(r)).to.not.eq('')
                expect(r.data?.admin?.modulesManagement ?? null).to.be.null
            })
    })

    // ── S61: GraphQL query denied without provisioningAccess ──────────────────────
    it('S61 — installedModules query is DENIED for a user lacking provisioningAccess [D2 fixed]', () => {
        asUser(PLAIN_ADMIN)
            .apollo({ queryFile: 'graphql/query/getInstalledModules.graphql', errorPolicy: 'all' })
            .then((r: { data?: any; errors?: Array<{ message: string }> }) => {
                expect(errorsOf(r)).to.not.eq('')
                expect(r.data?.admin?.modulesManagement ?? null).to.be.null
            })
    })

    it('S61 — an authenticated user with no relevant grants is also denied', () => {
        asUser(NO_ACCESS)
            .apollo({ queryFile: 'graphql/query/getInstalledModules.graphql', errorPolicy: 'all' })
            .then((r: { data?: any; errors?: Array<{ message: string }> }) => {
                expect(errorsOf(r)).to.not.eq('')
                expect(r.data?.admin?.modulesManagement ?? null).to.be.null
            })
    })

    // ── S62: positive baseline — provAdmin succeeds ───────────────────────────────
    it('S62 — installedModules query succeeds for a user WITH provisioningAccess', () => {
        asUser(PROV_ADMIN)
            .apollo({ queryFile: 'graphql/query/getInstalledModules.graphql', errorPolicy: 'all' })
            .then((r: { data?: any; errors?: Array<{ message: string }> }) => {
                expect(errorsOf(r), `authorized caller must have no errors [${errorsOf(r)}]`).to.eq('')
                expect(r.data?.admin?.modulesManagement?.installedModules).to.be.an('array')
            })
    })

    it('S62 — updateModules(dryRun) mutation succeeds for a user WITH provisioningAccess', () => {
        asUser(PROV_ADMIN)
            .apollo({
                mutationFile: 'graphql/mutation/updateModulesDryRun.graphql',
                variables: { jahiaOnly: true, dryRun: true },
                errorPolicy: 'all',
            })
            .then((r: { data?: any; errors?: Array<{ message: string }> }) => {
                expect(errorsOf(r)).to.eq('')
                expect(r.data?.admin?.modulesManagement?.updateModules).to.have.property('yamlScript')
            })
    })

    // ── S63/S64/S65/S66/S67: servlet authorization + CSRF ─────────────────────────
    // The servlet APIs (module-management-community.upload/.import/.export) are granted ONLY by the
    // module's own security-filter scope, which is auto_apply:origin:hosted AND constrained by
    // user_permission:provisioningAccess. So the servlet grants access iff the request is (a)
    // authenticated, (b) same-origin (hosted — the CSRF defence), and (c) the user holds
    // provisioningAccess. The browser UI satisfies (b) automatically (fetch sends the same-origin
    // Origin header); cy.request must set Origin explicitly, otherwise the hosted scope is not applied
    // and every caller (incl. root) is denied — that missing Origin, not a code bug, was the earlier
    // "401 for everyone" observation. Verified live against the node: provAdmin+Origin -> 200,
    // plainAdmin/no-access/cross-origin/unauthenticated -> 401.
    const HOSTED = () => Cypress.config('baseUrl') as string
    const postSameOrigin = (url: string, user: string) =>
        cy.request({
            method: 'POST',
            url,
            auth: { username: user, password: PASSWORD },
            headers: { 'X-Requested-With': 'XMLHttpRequest', Origin: HOSTED() },
            failOnStatusCode: false,
        })

    it('S63 — upload servlet admits provAdmin and denies plainAdmin / no-access (same-origin)', () => {
        // provAdmin passes authorization → not 401/403 (400 multipart-required for the empty body).
        postSameOrigin(UPLOAD_URL, PROV_ADMIN).its('status').should('not.be.oneOf', [401, 403])
        postSameOrigin(UPLOAD_URL, PLAIN_ADMIN).its('status').should('be.oneOf', [401, 403])
        postSameOrigin(UPLOAD_URL, NO_ACCESS).its('status').should('be.oneOf', [401, 403])
    })

    it('S64 — import servlet admits provAdmin and denies plainAdmin (same-origin)', () => {
        postSameOrigin(IMPORT_URL, PROV_ADMIN).its('status').should('not.be.oneOf', [401, 403])
        postSameOrigin(IMPORT_URL, PLAIN_ADMIN).its('status').should('be.oneOf', [401, 403])
    })

    // ── S65: export servlet (GET) authorization ───────────────────────────────────
    it('S65 — export servlet returns a ZIP for provAdmin and denies plainAdmin (same-origin)', () => {
        cy.request({
            method: 'GET',
            url: EXPORT_URL,
            auth: { username: PROV_ADMIN, password: PASSWORD },
            headers: { Origin: HOSTED() },
            failOnStatusCode: false,
            encoding: 'binary',
        }).then((res) => {
            expect(res.status).to.eq(200)
            expect(String(res.headers['content-type'])).to.match(/zip|octet-stream/)
        })
        cy.request({
            method: 'GET',
            url: EXPORT_URL,
            auth: { username: PLAIN_ADMIN, password: PASSWORD },
            headers: { Origin: HOSTED() },
            failOnStatusCode: false,
        })
            .its('status')
            .should('be.oneOf', [401, 403])
    })

    // ── S66: unauthenticated + cross-origin (CSRF) rejection ──────────────────────
    it('S66 — unauthenticated upload request is rejected', () => {
        cy.clearCookies()
        cy.request({
            method: 'POST',
            url: UPLOAD_URL,
            headers: { 'X-Requested-With': 'XMLHttpRequest', Origin: HOSTED() },
            failOnStatusCode: false,
        })
            .its('status')
            .should('be.oneOf', [401, 403])
    })

    it('S66 — a cross-origin request is rejected even for provAdmin (CSRF defence via hosted scope)', () => {
        // The hosted scope is not applied to a cross-origin request, so even an authorized user is
        // denied — this is the CSRF protection that replaces the old (UI-breaking) session rejection.
        cy.request({
            method: 'POST',
            url: UPLOAD_URL,
            auth: { username: PROV_ADMIN, password: PASSWORD },
            headers: { 'X-Requested-With': 'XMLHttpRequest', Origin: 'https://evil.example.com' },
            failOnStatusCode: false,
        })
            .its('status')
            .should('be.oneOf', [401, 403])
    })

    // ── S67: CORS — ACAO reflected only same-origin ───────────────────────────────
    it('S67 — cross-origin request receives no Access-Control-Allow-Origin header', () => {
        cy.request({
            method: 'GET',
            url: EXPORT_URL,
            auth: { username: PROV_ADMIN, password: PASSWORD },
            headers: { Origin: 'https://evil.example.com' },
            failOnStatusCode: false,
            encoding: 'binary',
        }).then((res) => {
            expect(res.headers).to.not.have.property('access-control-allow-origin')
        })
    })

    it('S67 — same-origin request reflects Access-Control-Allow-Origin', () => {
        cy.request({
            method: 'GET',
            url: EXPORT_URL,
            auth: { username: PROV_ADMIN, password: PASSWORD },
            headers: { Origin: HOSTED() },
            failOnStatusCode: false,
            encoding: 'binary',
        }).then((res) => {
            expect(String(res.headers['access-control-allow-origin'] ?? '')).to.eq(HOSTED())
        })
    })
})
