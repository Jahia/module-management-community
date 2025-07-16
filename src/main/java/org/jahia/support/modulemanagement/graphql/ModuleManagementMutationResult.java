package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.jahia.modules.graphql.provider.dxm.util.GqlUtils;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;

import javax.inject.Inject;
import java.io.IOException;
import java.util.List;
import java.util.Set;

public class ModuleManagementMutationResult {

    @Inject
    @GraphQLOsgiService(
            service = ModuleManagementCommunityService.class
    )
    ModuleManagementCommunityService moduleManagementCommunityService;

    @GraphQLField
    @GraphQLName("updateModules")
    @GraphQLDescription("Return the list of modules that have been updated")
    public Set<String> updateModules(@GraphQLName("jahiaOnly") @GraphQLDefaultValue(GqlUtils.SupplierTrue.class) boolean jahiaOnly,
                                     @GraphQLName("dryRun") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean dryRun,
                                     @GraphQLName("filters") List<String> filters) throws IOException {
        return moduleManagementCommunityService.updateModules(jahiaOnly, dryRun, filters);
    }

    @GraphQLField
    @GraphQLName("bundle")
    @GraphQLDescription("Allow developers to perform operations on bundles, such as installing, uninstalling, or updating")
    public GqlBundleMutation getBundle(@GraphQLName("bundleId") long bundleId) {
        return new GqlBundleMutation(moduleManagementCommunityService.getBundleById(bundleId));
    }

    @GraphQLField
    @GraphQLName("importModule")
    @GraphQLDescription("Import a module from the file system into the OSGi framework")
    public String importModule(@GraphQLName("bundleId") long bundleId,
                               @GraphQLName("force") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean force) throws IOException {
        if (moduleManagementCommunityService.importModule(moduleManagementCommunityService.getBundleById(bundleId), force))
            return "Module imported successfully.";
        else
            return "Failed to import module.";
    }
}
