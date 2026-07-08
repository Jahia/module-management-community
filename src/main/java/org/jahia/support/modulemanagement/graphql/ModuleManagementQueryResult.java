package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.apache.karaf.features.Feature;
import org.jahia.api.settings.SettingsBean;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.util.GqlUtils;
import org.jahia.osgi.BundleUtils;
import org.jahia.support.modulemanagement.ExportOptions;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.osgi.framework.Bundle;
import org.osgi.framework.FrameworkUtil;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

public class ModuleManagementQueryResult {

    @GraphQLField
    @GraphQLName("availableUpdates")
    @GraphQLDescription("Return a list of modules that have updates available")
    public Set<String> getAvailableUpdates(@GraphQLName("filters") List<String> filters) throws IOException {
        return getModuleManagementCommunityService().listAvailableUpdates(true, filters, false);
    }

    private ModuleManagementCommunityService getModuleManagementCommunityService() {
        ModuleManagementCommunityService service = BundleUtils.getOsgiService(ModuleManagementCommunityService.class, null);
        if (service == null) {
            throw new IllegalStateException("ModuleManagementCommunityService is not available. Please ensure the module is installed and active.");
        }
        return service;
    }

    private SettingsBean settingsBean() {
        SettingsBean settingsBean = BundleUtils.getOsgiService(SettingsBean.class, null);
        if (settingsBean == null) {
            throw new IllegalStateException("SettingsBean is not available");
        }
        return settingsBean;
    }

    @GraphQLField
    @GraphQLName("lastUpdateTime")
    @GraphQLDescription("Return the last time the module updates were checked")
    public String getLastUpdateTime() {
        java.time.Instant lastUpdateTime = getModuleManagementCommunityService().getLastUpdateTime();
        return lastUpdateTime != null ? lastUpdateTime.toString() : null;
    }


    @GraphQLField
    @GraphQLName("features")
    @GraphQLDescription("Return a list of features available in the Jahia community edition")
    public List<GqlFeature> getFeatures(@GraphQLName("jahiaOnly") @GraphQLDefaultValue(GqlUtils.SupplierTrue.class) boolean jahiaOnly,
                                     @GraphQLName("filters") List<String> filters) throws IOException {
        return getModuleManagementCommunityService().getFeatures(jahiaOnly, filters).stream().map(
                GqlFeature::new
        ).collect(Collectors.toList());
    }

    @GraphQLField
    @GraphQLName("bundle")
    @GraphQLDescription("Return different information about a bundle")
    public GqlBundle getBundle(@GraphQLName("name") String name, @GraphQLName("version") String version) {
        Bundle bundle = null;
        if(version == null) {
            bundle = Arrays.stream(FrameworkUtil.getBundle(ModuleManagementCommunityService.class).getBundleContext().getBundles()).filter(b -> b.getSymbolicName().equals(name)).findFirst().orElse(null);
        } else {
            bundle = Arrays.stream(FrameworkUtil.getBundle(ModuleManagementCommunityService.class).getBundleContext().getBundles()).filter(b -> b.getSymbolicName().equals(name) && version.equals(b.getVersion().toString())).findFirst().orElse(null);
        }
        // bundle might have been uninstalled and so be null still
        if (bundle == null) {
            throw new DataFetchingException("Bundle with name " + name + " and version " + version + " not found");
        }
        return settingsBean().isClusterActivated() ? new ClusteredGqlBundle(bundle) : new GqlBundle(bundle);
    }

    @GraphQLField
    @GraphQLName("installedModules")
    @GraphQLDescription("Return a list of installed modules in the Jahia community edition")
    public Set<String> getInstalledModules() throws IOException {
        return getModuleManagementCommunityService().getInstalledModules();
    }

    @GraphQLField
    @GraphQLName("installedBundleTypes")
    @GraphQLDescription("Return a list of 'symbolicName:type' for all installed bundles — lightweight pre-fetch for type filtering")
    public List<String> getInstalledBundleTypes() {
        return Arrays.stream(FrameworkUtil.getBundle(ModuleManagementCommunityService.class)
                        .getBundleContext().getBundles())
                .map(b -> {
                    String type = b.getHeaders().get("Jahia-Module-Type");
                    return b.getSymbolicName() + ":" + (type != null ? type : "bundle");
                })
                .collect(Collectors.toList());
    }

    @GraphQLField
    @GraphQLName("exportYamlPreview")
    @GraphQLDescription("Preview the provisioning YAML that would be generated for a module snapshot export, without downloading a ZIP")
    public String getExportYamlPreview(
            @GraphQLName("types") List<String> types,
            @GraphQLName("embedAll") @GraphQLDefaultValue(GqlUtils.SupplierTrue.class) boolean embedAll) throws java.io.IOException {
        Set<String> typesSet = types != null ? new HashSet<>(types) : null;
        return getModuleManagementCommunityService().previewExportYaml(new ExportOptions(typesSet, embedAll));
    }

    @GraphQLField
    @GraphQLName("clustered")
    @GraphQLDescription("Return true if the Jahia instance is clustered")
    public boolean isClustered() {
        return settingsBean().isClusterActivated();
    }

    @GraphQLField
    @GraphQLName("storeModules")
    @GraphQLDescription("Return store modules that are not currently installed on this server, " +
            "compatible with the running Jahia version, sorted by symbolic name.")
    public List<GqlAvailableStoreModule> getStoreModules(
            @GraphQLName("searchTerm") String searchTerm) {
        return getModuleManagementCommunityService()
                .getStoreModulesNotInstalled(searchTerm)
                .stream()
                .map(GqlAvailableStoreModule::new)
                .collect(Collectors.toList());
    }

    @GraphQLName("GqlAvailableStoreModule")
    public static class GqlAvailableStoreModule {
        private final Map<String, String> data;

        public GqlAvailableStoreModule(Map<String, String> data) {
            this.data = data;
        }

        @GraphQLField
        @GraphQLName("symbolicName")
        public String getSymbolicName() {
            return data.get("symbolicName");
        }

        @GraphQLField
        @GraphQLName("title")
        public String getTitle() {
            return data.get("title");
        }

        @GraphQLField
        @GraphQLName("icon")
        public String getIcon() {
            return data.get("icon");
        }

        @GraphQLField
        @GraphQLName("latestVersion")
        public String getLatestVersion() {
            return data.get("latestVersion");
        }

        @GraphQLField
        @GraphQLName("storeUrl")
        public String getStoreUrl() {
            return data.get("storeUrl");
        }
    }

    public class GqlFeature {
        Feature feature;

        public GqlFeature(Feature feature) {
            this.feature = feature;
        }

        @GraphQLField
        @GraphQLName("name")
        @GraphQLDescription("The name of the feature")
        public String getName() {
            return feature.getName();
        }

        @GraphQLField
        @GraphQLName("version")
        @GraphQLDescription("The version of the feature")
        public String getVersion() {
            return feature.getVersion();
        }

        @GraphQLField
        @GraphQLName("description")
        @GraphQLDescription("The description of the feature")
        public String getDescription() {
            return feature.getDescription();
        }

        @GraphQLField
        @GraphQLName("dependencies")
        @GraphQLDescription("The dependencies of the feature")
        public List<String> getDependencies() {
            return feature.getDependencies().stream()
                    .map(dep -> dep.getName() + "@" + dep.getVersion())
                    .collect(Collectors.toList());
        }

        @GraphQLField
        @GraphQLName("bundles")
        @GraphQLDescription("The bundles included in this feature")
        public List<String> getBundles() {
            return feature.getBundles().stream()
                    .map(org.apache.karaf.features.BundleInfo::getLocation)
                    .collect(Collectors.toList());
        }

        @GraphQLField
        @GraphQLName("url")
        @GraphQLDescription("The URL of the feature repository")
        public String getUrl() {
            return feature.getRepositoryUrl();
        }
    }
}
