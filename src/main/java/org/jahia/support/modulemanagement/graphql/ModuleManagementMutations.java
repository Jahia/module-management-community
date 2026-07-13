package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.admin.GqlAdminMutation;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;
import org.jahia.services.securityfilter.PermissionService;

import javax.jcr.RepositoryException;

/**
 * Admin mutation class for Module Management
 */
@GraphQLTypeExtension(GqlAdminMutation.class)
public final class ModuleManagementMutations {

    private ModuleManagementMutations() {
        // Utility class — prevent instantiation
    }

    @GraphQLField
    @GraphQLName("modulesManagement")
    @GraphQLRequiresPermission(value = "graphqlAdminMutation")
    public static ModuleManagementMutationResult modulesManagement() {
        // D2: enforce provisioningAccess in-code — the declarative security-filter scope cannot
        // restrict below the graphqlAdminMutation baseline (additive merge), so this is the real gate.
        ProvisioningAccessGuard.enforce();
        return new ModuleManagementMutationResult();
    }
}

