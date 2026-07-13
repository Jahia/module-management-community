package org.jahia.support.modulemanagement.graphql;

import graphql.ErrorType;
import org.jahia.modules.graphql.provider.dxm.BaseGqlClientException;

/**
 * Raised when a caller attempts a Module Management provisioning operation without holding the
 * {@code provisioningAccess} permission at the JCR root ({@code /}).
 *
 * <p>Surfaces to the client as a standard GraphQL authorization error (null data for the guarded
 * field plus an error entry), mirroring the framework's own
 * {@code org.jahia.modules.graphql.provider.dxm.security.GqlAccessDeniedException} — which cannot be
 * instantiated from outside its package, hence this module-local equivalent.
 */
public class ProvisioningAccessDeniedException extends BaseGqlClientException {

    private static final long serialVersionUID = 1L;

    public ProvisioningAccessDeniedException() {
        super("Access denied: the 'provisioningAccess' permission (at /) is required to use the Module Management provisioning API",
                ErrorType.DataFetchingException);
    }
}
