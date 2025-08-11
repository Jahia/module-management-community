package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.jahia.osgi.BundleLifecycleUtils;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.modulemanager.spi.BundleService;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleException;

import javax.inject.Inject;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class GqlBundleMutation {

    private final Bundle bundle;

    public GqlBundleMutation(Bundle bundle) {
        this.bundle = bundle;
    }

    @GraphQLField
    @GraphQLName("stop")
    public String stop() {
        try {
            bundle.stop();
            return "Bundle " + bundle.getSymbolicName() + " stopped successfully.";
        } catch (BundleException e) {
            throw new DataFetchingException(
                    "Failed to stop bundle " + bundle.getSymbolicName() + ": " + e.getMessage(), e);
        }
    }

    @GraphQLField
    @GraphQLName("start")
    public String start() {
        try {
            bundle.start();
            return "Bundle " + bundle.getSymbolicName() + " stopped successfully.";
        } catch (BundleException e) {
            throw new DataFetchingException(
                    "Failed to stop bundle " + bundle.getSymbolicName() + ": " + e.getMessage(), e);
        }
    }

    @GraphQLField
    @GraphQLName("refresh")
    public String refresh() {
            BundleLifecycleUtils.refreshBundle(bundle);
            return "Bundle " + bundle.getSymbolicName() + " refreshed successfully.";
    }

    @GraphQLField
    @GraphQLName("enableOnSites")
    public String enableOnSites(@GraphQLName("siteKeys") List<String> siteKeys) {
        ModuleManagementCommunityService managementCommunityService = BundleUtils.getOsgiService(ModuleManagementCommunityService.class, null);
        if (managementCommunityService == null) {
            throw new DataFetchingException("ModuleManagementCommunityService is not available.");
        }
        if (managementCommunityService.enableModuleOnSites(bundle, new HashSet<>(siteKeys))) {
            return "Module " + bundle.getSymbolicName() + " enabled on sites: " + String.join(", ", siteKeys);
        } else {
            throw new DataFetchingException("Failed to enable module " + bundle.getSymbolicName() + " on sites: " + String.join(", ", siteKeys));
        }
    }

    @GraphQLField
    @GraphQLName("disableOnSites")
    public String disableOnSites(@GraphQLName("siteKeys") List<String> siteKeys) {
        ModuleManagementCommunityService managementCommunityService = BundleUtils.getOsgiService(ModuleManagementCommunityService.class, null);
        if (managementCommunityService == null) {
            throw new DataFetchingException("ModuleManagementCommunityService is not available.");
        }
        if (managementCommunityService.disableModuleOnSites(bundle, new HashSet<>(siteKeys))) {
            return "Module " + bundle.getSymbolicName() + " disabled on sites: " + String.join(", ", siteKeys);
        } else {
            throw new DataFetchingException("Failed to disable module " + bundle.getSymbolicName() + " on sites: " + String.join(", ", siteKeys));
        }
    }
}
