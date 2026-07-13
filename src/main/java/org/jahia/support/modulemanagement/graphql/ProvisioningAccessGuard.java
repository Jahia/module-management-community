package org.jahia.support.modulemanagement.graphql;

import org.jahia.services.content.JCRSessionFactory;
import org.jahia.services.content.JCRSessionWrapper;

import javax.jcr.RepositoryException;

/**
 * Centralised, in-code enforcement of the {@code provisioningAccess} permission for the Module
 * Management GraphQL API.
 *
 * <p><b>Why this exists (security — finding D2).</b> The RCE-capable provisioning operations
 * (install / update / uninstall OSGi bundles, run provisioning scripts) live under Jahia's admin
 * GraphQL namespace, reachable by any holder of the {@code graphqlAdminQuery} /
 * {@code graphqlAdminMutation} baseline permission. The module ships a declarative security-filter
 * scope constrained on {@code provisioningAccess}, but security-filter scopes are <em>additively
 * merged</em> with Jahia's default admin profile: a declarative scope can only <em>grant</em>
 * access, never <em>restrict</em> it below the admin baseline. Without an explicit in-code check a
 * partial admin (e.g. {@code graphqlAdminMutation} but no {@code provisioningAccess}) could drive
 * the whole provisioning API. This guard closes that gap by verifying the caller genuinely holds
 * {@code provisioningAccess} at the JCR root ({@code /}) — the correct scope because these are
 * server-global operations, not site-scoped.
 *
 * <p>It is invoked at the single choke point of each namespace container ({@code modulesManagement}
 * on the admin Query and Mutation), so every nested operation is guarded consistently. The check
 * follows the same pattern as Jahia's own
 * {@code org.jahia.modules.graphql.provider.dxm.security.GqlJcrPermissionChecker}
 * ({@code session.getNode("/").hasPermission(perm)}).
 */
public final class ProvisioningAccessGuard {

    /** JCR permission required to use any Module Management provisioning operation. */
    public static final String PROVISIONING_ACCESS = "provisioningAccess";

    private ProvisioningAccessGuard() {
        // utility class — no instances
    }

    /**
     * Enforces that the current user holds {@link #PROVISIONING_ACCESS} at the repository root.
     *
     * @throws ProvisioningAccessDeniedException if the current user lacks the permission, is not
     *         authenticated, or the check cannot be performed.
     */
    public static void enforce() {
        try {
            JCRSessionWrapper session = JCRSessionFactory.getInstance().getCurrentUserSession();
            if (session == null || !session.getNode("/").hasPermission(PROVISIONING_ACCESS)) {
                throw new ProvisioningAccessDeniedException();
            }
        } catch (RepositoryException e) {
            throw new ProvisioningAccessDeniedException();
        }
    }
}
