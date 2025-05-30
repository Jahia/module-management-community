package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.admin.GqlAdminMutation;
import org.jahia.modules.graphql.provider.dxm.admin.GqlAdminQuery;

/**
 * Admin mutation class for Module Management
 */
@GraphQLTypeExtension(GqlAdminQuery.class)
public final class ModuleManagementQuery {

    @GraphQLField
    @GraphQLName("modulesManagement")
    public static ModuleManagementQueryResult modulesManagement() {
        return new ModuleManagementQueryResult();
    }
}

