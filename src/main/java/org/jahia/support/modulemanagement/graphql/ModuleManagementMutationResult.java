package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.modules.graphql.provider.dxm.util.GqlUtils;
import org.jahia.osgi.BundleUtils;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;

import javax.jcr.RepositoryException;
import java.io.IOException;
import java.util.List;

public class ModuleManagementMutationResult {

    private ModuleManagementCommunityService moduleManagementCommunityService() {
        return BundleUtils.getOsgiService(ModuleManagementCommunityService.class, null);
    }

    @GraphQLField
    @GraphQLName("updateModules")
    @GraphQLDescription("Return the list of modules that have been updated and the provisioning YAML script")
    public GqlUpdateModulesResult updateModules(@GraphQLName("jahiaOnly") @GraphQLDefaultValue(GqlUtils.SupplierTrue.class) boolean jahiaOnly,
                                     @GraphQLName("dryRun") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean dryRun,
                                     @GraphQLName("autostart") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean autostart,
                                     @GraphQLName("uninstallPrevious") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean uninstallPrevious,
                                     @GraphQLName("forceUpdateAll") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean forceUpdateAll,
                                     @GraphQLName("onStartup") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean onStartup,
                                     @GraphQLName("filters") List<String> filters) throws IOException {
        return new GqlUpdateModulesResult(moduleManagementCommunityService().updateModules(jahiaOnly, dryRun, filters, autostart, uninstallPrevious, forceUpdateAll, onStartup));
    }

    @GraphQLField
    @GraphQLName("bundle")
    @GraphQLDescription("Allow developers to perform operations on bundles, such as installing, uninstalling, or updating")
    public GqlBundleMutation getBundle(@GraphQLName("bundleId") long bundleId) {
        return new GqlBundleMutation(moduleManagementCommunityService().getBundleById(bundleId));
    }

    @GraphQLField
    @GraphQLName("importModule")
    @GraphQLDescription("Import a module from the file system into the OSGi framework")
    public String importModule(@GraphQLName("bundleId") long bundleId,
                               @GraphQLName("force") @GraphQLDefaultValue(GqlUtils.SupplierFalse.class) boolean force) throws IOException {
        ModuleManagementCommunityService service = moduleManagementCommunityService();
        if (service.importModule(service.getBundleById(bundleId), force))
            return "Module imported successfully.";
        else
            return "Failed to import module.";
    }

    @GraphQLField
    @GraphQLName("installBundleFromJcr")
    @GraphQLDescription("Install a bundle version from its JCR path (rollback to a previous version stored in /module-management/bundles/)")
    public String installBundleFromJcr(@GraphQLName("jcrPath") String jcrPath) throws IOException {
        return moduleManagementCommunityService().installBundleVersionFromJcr(jcrPath);
    }

    @GraphQLField
    @GraphQLName("installBundleFromStore")
    @GraphQLDescription("Install a specific version of a Jahia module from the store catalogue. " +
            "Generates and executes a server-side provisioning YAML script — no direct download link is used.")
    public String installBundleFromStore(
            @GraphQLName("symbolicName") String symbolicName,
            @GraphQLName("version") String version) throws IOException {
        return moduleManagementCommunityService().installBundleVersionFromStore(symbolicName, version);
    }

    @GraphQLField
    @GraphQLName("cleanupJcrVersions")
    @GraphQLDescription("Remove old module versions from the JCR module-management store, keeping only the " +
            "currently-installed version(s) and one previous version per module. " +
            "Returns a human-readable summary of what was removed.")
    public String cleanupJcrVersions() throws RepositoryException {
        return moduleManagementCommunityService().cleanupJcrVersions();
    }

    @GraphQLField
    @GraphQLName("generateProvisioningScript")
    @GraphQLDescription("Generate a YAML provisioning script to replay the given (non-SNAPSHOT) modules on another server.")
    public String generateProvisioningScript(
            @GraphQLName("symbolicNames") List<String> symbolicNames) {
        return moduleManagementCommunityService().generateProvisioningScript(symbolicNames);
    }

    @GraphQLField
    @GraphQLName("installStoreModules")
    @GraphQLDescription("Install one or more modules from the store catalogue. " +
            "The latest compatible non-SNAPSHOT version of each module is resolved and installed " +
            "via a single provisioning script execution.")
    public String installStoreModules(
            @GraphQLName("symbolicNames") List<String> symbolicNames) throws java.io.IOException {
        return moduleManagementCommunityService().installStoreModules(symbolicNames);
    }
}
