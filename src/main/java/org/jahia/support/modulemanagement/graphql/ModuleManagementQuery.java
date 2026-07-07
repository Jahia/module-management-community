package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.admin.GqlAdminQuery;
import org.jahia.modules.graphql.provider.dxm.security.GraphQLRequiresPermission;
import org.jahia.services.securityfilter.PermissionService;

import javax.jcr.RepositoryException;

/**
 * Admin mutation class for Module Management
 */
@GraphQLTypeExtension(GqlAdminQuery.class)
public final class ModuleManagementQuery {

    private ModuleManagementQuery() {
        // Utility class — prevent instantiation
    }

    @GraphQLField
    @GraphQLName("modulesManagement")
    @GraphQLRequiresPermission(value = "graphqlAdminQuery")
    public static ModuleManagementQueryResult modulesManagement() {
        return new ModuleManagementQueryResult();
    }
}

