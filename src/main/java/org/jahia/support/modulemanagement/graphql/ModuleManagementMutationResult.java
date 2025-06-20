package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.jahia.modules.graphql.provider.dxm.util.GqlUtils;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.osgi.framework.FrameworkUtil;

import javax.inject.Inject;
import java.io.IOException;
import java.util.List;

public class ModuleManagementMutationResult {

    @Inject
    @GraphQLOsgiService(
            service = ModuleManagementCommunityService.class
    )
    ModuleManagementCommunityService moduleManagementCommunityService;

    @GraphQLField
    @GraphQLName("updateModules")
    @GraphQLDescription("Return the list of modules that have been updated")
    public List<String> updateModules(@GraphQLName("jahiaOnly") @GraphQLDefaultValue(GqlUtils.SupplierTrue.class) boolean jahiaOnly,
                                      @GraphQLName("filters") List<String> filters) throws IOException {
        return moduleManagementCommunityService.updateModules(jahiaOnly, false, filters);
    }

    @GraphQLField
    @GraphQLName("bundle")
    @GraphQLDescription("Allow developers to perform operations on bundles, such as installing, uninstalling, or updating")
    public GqlBundleMutation getBundle(@GraphQLName("bundleId") long bundleId) {
        return new GqlBundleMutation(moduleManagementCommunityService.getBundleById(bundleId));
    }

}
