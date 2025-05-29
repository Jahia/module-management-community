package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLTypeExtension;
import org.jahia.modules.graphql.provider.dxm.admin.GqlAdminMutation;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Admin query class for Module Management
 */
@GraphQLTypeExtension(GqlAdminMutation.class)
public final class ModuleManagementMutations {
    private static Logger logger = LoggerFactory.getLogger(ModuleManagementMutations.class);

    @GraphQLField
    @GraphQLName("modulesManagement")
    public static ModuleManagementMutationResult modulesManagement() {
        return new ModuleManagementMutationResult();
    }
}

