package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.admin.GqlAdminMutation;

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
    public static ModuleManagementMutationResult modulesManagement() {
        return new ModuleManagementMutationResult();
    }
}

