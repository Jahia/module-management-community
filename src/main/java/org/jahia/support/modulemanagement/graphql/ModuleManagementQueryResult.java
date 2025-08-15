package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.apache.karaf.features.Feature;
import org.jahia.api.settings.SettingsBean;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.jahia.modules.graphql.provider.dxm.util.GqlUtils;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.osgi.framework.Bundle;
import org.osgi.framework.FrameworkUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import javax.inject.Inject;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

public class ModuleManagementQueryResult {

    @Inject
    @GraphQLOsgiService(
            service = ModuleManagementCommunityService.class
    )
    ModuleManagementCommunityService moduleManagementCommunityService;

    @Inject
    @GraphQLOsgiService(service = SettingsBean.class)
    SettingsBean settingsBean;

    @GraphQLField
    @GraphQLName("availableUpdates")
    @GraphQLDescription("Return a list of modules that have updates available")
    public Set<String> getAvailableUpdates(@GraphQLName("filters") List<String> filters) throws IOException {
        return moduleManagementCommunityService.listAvailableUpdates(true, filters);
    }

    @GraphQLField
    @GraphQLName("lastUpdateTime")
    @GraphQLDescription("Return the last time the module updates were checked")
    public String getLastUpdateTime() {
        return moduleManagementCommunityService.getLastUpdateTime().toString();
    }


    @GraphQLField
    @GraphQLName("features")
    @GraphQLDescription("Return a list of features available in the Jahia community edition")
    public List<GqlFeature> getFeatures(@GraphQLName("jahiaOnly") @GraphQLDefaultValue(GqlUtils.SupplierTrue.class) boolean jahiaOnly,
                                     @GraphQLName("filters") List<String> filters) throws IOException {
        return moduleManagementCommunityService.getFeatures(jahiaOnly, filters).stream().map(
                GqlFeature::new
        ).collect(Collectors.toList());
    }

    @GraphQLField
    @GraphQLName("bundle")
    @GraphQLDescription("Return different information about a bundle")
    public GqlBundle getBundle(@GraphQLName("name") String name) throws IOException {
        Bundle bundle = Arrays.stream(FrameworkUtil.getBundle(ModuleManagementCommunityService.class).getBundleContext().getBundles()).filter(b -> b.getSymbolicName().equals(name)).findFirst().orElse(null);
        return settingsBean.isClusterActivated() ? new ClusteredGqlBundle(bundle) : new GqlBundle(bundle);
    }

    @GraphQLField
    @GraphQLName("installedModules")
    @GraphQLDescription("Return a list of installed modules in the Jahia community edition")
    public Set<String> getInstalledModules() throws IOException {
        return moduleManagementCommunityService.getInstalledModules();
    }

    @GraphQLField
    @GraphQLName("clustered")
    @GraphQLDescription("Return true if the Jahia instance is clustered")
    public boolean isClustered() {
        return settingsBean.isClusterActivated();
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
                    .map(bundleInfo -> bundleInfo.getLocation())
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
