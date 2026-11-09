/**
 * End-to-end tests for the Server status community admin screen.
 *
 * Admin route: /jahia/administration/server-status-community
 * It shows the version and the overall health of the server, and a DataTable with
 * the status of each Server Availability Manager (SAM) probe.
 */

describe('Server status community', () => {
    const adminPath = '/jahia/administration/server-status-community';

    /** The Apollo client of Jahia batches its operations, so a request body is an array of them. */
    const serverStatusOperation = (body: unknown) => (Array.isArray(body) ? body : [body])
        .find(operation => operation?.operationName === 'GetServerStatus');

    const visitPage = () => {
        cy.login();
        cy.visit(adminPath);
        cy.get('[data-testid="server-status-summary"]', {timeout: 20000}).should('be.visible');
    };

    beforeEach(visitPage);

    it('shows the aggregated server status as the icon of the entry of the administration tree', () => {
        cy.get('[data-testid="server-status-nav-icon"]', {timeout: 20000})
            .should('have.attr', 'data-health')
            .and('match', /^(GREEN|YELLOW|RED)$/);
        cy.get('[data-testid="server-status-nav-icon"]')
            .invoke('attr', 'aria-label')
            .should('match', /^Server status: (OK|Warning|Error)$/);
    });

    it('names both entries of the administration tree with Community in parentheses', () => {
        cy.contains('Module Management (Community)').should('be.visible');
        cy.contains('Server Status (Community)').should('be.visible');
    });

    it('renders the screen title in the header', () => {
        cy.get('h1').should('contain.text', 'Server status');
    });

    it('shows the server health, the Jahia version, and the build number', () => {
        cy.get('[data-testid="server-status-summary"]').within(() => {
            cy.contains('Server status').should('be.visible');
            cy.contains('Jahia version').should('be.visible');
            cy.contains('Build number').should('be.visible');
            cy.contains(/^(OK|Warning|Error)$/).should('be.visible');
        });
    });

    it('lists the probes in a table with name, description, severity and status', () => {
        cy.get('[data-testid="server-status-probes"]').within(() => {
            cy.contains('th', 'Name').should('be.visible');
            cy.contains('th', 'Description').should('be.visible');
            cy.contains('th', 'Severity').should('be.visible');
            cy.contains('th', 'Status').should('be.visible');
            cy.get('tbody tr').should('have.length.at.least', 1);
        });
    });

    it('shows the severity of each probe in sentence case', () => {
        cy.get('[data-testid="server-status-probes"] tbody tr').first().within(() => {
            cy.contains(/^(Critical|High|Medium|Low|Debug)$/).should('be.visible');
        });
        cy.get('[data-testid="server-status-probes"] tbody').should('not.contain.text', 'CRITICAL');
    });

    it('lists the probes of severity High and above by default', () => {
        cy.get('[data-testid="server-status-severity"]').should('contain.text', 'High and above');
    });

    it('reloads the probes of the severity chosen above the table', () => {
        cy.intercept('POST', '**/modules/graphql', req => {
            if (serverStatusOperation(req.body)?.variables?.severity === 'MEDIUM') {
                req.alias = 'mediumStatus';
            }
        });
        cy.get('[data-testid="server-status-severity"] [role="listbox"]').click();
        cy.contains('Medium and above').click();
        cy.wait('@mediumStatus');
        cy.get('[data-testid="server-status-severity"]').should('contain.text', 'Medium and above');
    });

    it('sorts the probes by name when the Name header is clicked', () => {
        cy.get('[data-testid="server-status-probes"]').within(() => {
            cy.contains('th', 'Name').click();
            cy.contains('th', 'Name').should('have.attr', 'aria-sort', 'ascending');
        });
    });

    it('renders a Refresh button in the action bar that reloads the status', () => {
        cy.intercept('POST', '**/modules/graphql', req => {
            if (serverStatusOperation(req.body)) {
                req.alias = 'serverStatus';
            }
        });
        cy.get('[role="toolbar"]').contains('button', 'Refresh').should('be.visible');
        cy.get('[data-testid="server-status-refresh"]').click();
        cy.wait('@serverStatus');
        cy.get('[data-testid="server-status-probes"]').should('be.visible');
    });
});
