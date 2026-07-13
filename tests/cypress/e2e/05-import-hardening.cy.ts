import { PASSWORD, PROV_ADMIN, setupPermissionUsers, teardownPermissionUsers } from '../support/permissionUsers'

/**
 * S74 / S75 — end-to-end import-servlet hardening (complements the JUnit S7/S8 and S3-S6 guards).
 * A snapshot ZIP whose provisioning.yaml carries a `karafCommand`, and a ZIP carrying a zip-slip
 * entry / disallowed `.sh`, must be REJECTED by an authorized (provAdmin) caller — proving the
 * anti-RCE and zip-slip guards fire on the real request path, not just in unit tests.
 */
const IMPORT_URL = '/modules/module-management-community/import'
const BOUNDARY = '----mmcHardeningBoundary1234'

/** Build a multipart/form-data body carrying `bytes` as the `archive` file part. */
const multipart = (bytes: number[], fileName: string) => {
    const CRLF = '\r\n'
    const head = Cypress.Buffer.from(
        `--${BOUNDARY}${CRLF}` +
            `Content-Disposition: form-data; name="archive"; filename="${fileName}"${CRLF}` +
            `Content-Type: application/zip${CRLF}${CRLF}`,
        'utf8',
    )
    const tail = Cypress.Buffer.from(`${CRLF}--${BOUNDARY}--${CRLF}`, 'utf8')
    return Cypress.Buffer.concat([head, Cypress.Buffer.from(bytes), tail])
}

const postArchive = (bytes: number[], fileName: string) =>
    cy.request({
        method: 'POST',
        url: IMPORT_URL,
        auth: { username: PROV_ADMIN, password: PASSWORD },
        headers: {
            'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`,
            'X-Requested-With': 'XMLHttpRequest',
            // Same-origin header so the provisioningAccess-constrained, origin:hosted servlet scope is
            // applied and the request is authorized — otherwise it is rejected at auth and never reaches
            // the anti-RCE / zip-slip guards this spec is meant to exercise.
            Origin: Cypress.config('baseUrl') as string,
        },
        body: multipart(bytes, fileName),
        failOnStatusCode: false,
    })

describe('module-management-community — import hardening (U13/U14)', () => {
    before(setupPermissionUsers)
    after(teardownPermissionUsers)

    it('S74 — a snapshot ZIP whose provisioning.yaml contains karafCommand is rejected', () => {
        cy.task<number[]>('buildKarafCommandZip').then((bytes) => {
            postArchive(bytes, 'snapshot.zip').then((res) => {
                // The archive must NOT import successfully (no success message body).
                expect(res.status, 'karafCommand archive must not be accepted').to.not.eq(200)
                expect(JSON.stringify(res.body)).to.not.contain('"message"')
            })
        })
    })

    it('S75 — a ZIP containing a zip-slip entry / disallowed extension is rejected', () => {
        cy.task<number[]>('buildZipSlipZip').then((bytes) => {
            postArchive(bytes, 'evil.zip').then((res) => {
                expect(res.status, 'zip-slip archive must not be accepted').to.not.eq(200)
                expect(JSON.stringify(res.body)).to.not.contain('"message"')
            })
        })
    })
})
