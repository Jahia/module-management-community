import {createUser, deleteUser, grantRoles, addNode, deleteNode} from '@jahia/cypress';

/**
 * Permission-scoped users for the module-management-community authorization specs (P4).
 *
 * The RCE-capable GraphQL API and the upload/import/export servlets are gated by the module's
 * OSGi API security-filter YAML (org.jahia.bundles.api.authorization-modulemanagementcommunity.yml)
 * which requires `provisioningAccess` (at the JCR root) to grant:
 *   - graphql.AdminQuery.modulesManagement / graphql.AdminMutation.modulesManagement (+ result types)
 *   - the module-management-community.upload / .import / .export servlet APIs
 * The GraphQL containers additionally carry @GraphQLRequiresPermission(graphqlAdminQuery/Mutation).
 *
 * Users:
 *   PROV_ADMIN  — provisioningAccess + graphqlAdminQuery/Mutation + adminTemplates (fully authorized)
 *   PLAIN_ADMIN — graphqlAdminQuery/Mutation + adminTemplates but NO provisioningAccess (the D2 negative)
 *   NO_ACCESS   — authenticated, no relevant grants
 *
 * IMPORTANT (Stage 6): these prove the security filter, so the test node MUST run with the API
 * security filter ENFORCING (not security.profile=open) and the module's authorization YAML loaded,
 * otherwise the provisioningAccess gate is bypassed and the negative tests would falsely pass.
 */

export const PASSWORD = 'MmcAuth9PwdTest';

export const PROV_ADMIN = 'mmc-prov-admin';
export const PLAIN_ADMIN = 'mmc-plain-admin';
export const NO_ACCESS = 'mmc-no-access';

const PROV_ROLE = 'mmc-prov-role';
const PLAIN_ROLE = 'mmc-plain-role';

const serverRole = (name: string, permissions: string[]) => {
    addNode({
        parentPathOrId: '/roles',
        primaryNodeType: 'jnt:role',
        name,
        properties: [
            {name: 'j:permissionNames', values: permissions, type: 'STRING'},
            {name: 'j:roleGroup', value: 'server-role', type: 'STRING'},
            {name: 'j:nodeTypes', values: ['rep:root'], type: 'STRING'},
            {name: 'j:privilegedAccess', value: 'true', type: 'BOOLEAN'}
        ]
    });
};

export const setupPermissionUsers = (): void => {
    cy.login(); // root

    serverRole(PROV_ROLE, ['provisioningAccess', 'graphqlAdminQuery', 'graphqlAdminMutation', 'adminTemplates']);
    serverRole(PLAIN_ROLE, ['graphqlAdminQuery', 'graphqlAdminMutation', 'adminTemplates']);

    createUser(PROV_ADMIN, PASSWORD);
    createUser(PLAIN_ADMIN, PASSWORD);
    createUser(NO_ACCESS, PASSWORD);

    grantRoles('/', [PROV_ROLE], PROV_ADMIN, 'USER');
    grantRoles('/', [PLAIN_ROLE], PLAIN_ADMIN, 'USER');
    // NO_ACCESS gets no grants.
};

export const teardownPermissionUsers = (): void => {
    cy.apolloClient(); // reset apollo client back to root
    cy.login();
    deleteUser(PROV_ADMIN);
    deleteUser(PLAIN_ADMIN);
    deleteUser(NO_ACCESS);
    deleteNode(`/roles/${PROV_ROLE}`);
    deleteNode(`/roles/${PLAIN_ROLE}`);
};
