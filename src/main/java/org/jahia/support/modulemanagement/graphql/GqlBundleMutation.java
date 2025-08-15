package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.modulemanager.ModuleManager;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.osgi.framework.Bundle;

import java.util.HashSet;
import java.util.List;

public class GqlBundleMutation {

    private final Bundle bundle;

    public GqlBundleMutation(Bundle bundle) {
        this.bundle = bundle;
    }

    @GraphQLField
    @GraphQLName("stop")
    public String stop() {
        ModuleManager moduleManager = BundleUtils.getOsgiService("org.jahia.services.modulemanager.ModuleManager");
        if (moduleManager != null) {
            moduleManager.stop(bundle.getSymbolicName(), null);
        }
        return "Bundle " + bundle.getSymbolicName() + " stopped successfully.";
    }

    @GraphQLField
    @GraphQLName("start")
    public String start() {
        ModuleManager moduleManager = BundleUtils.getOsgiService("org.jahia.services.modulemanager.ModuleManager");
        if (moduleManager != null) {
            moduleManager.start(bundle.getSymbolicName(), null);
        }
        return "Bundle " + bundle.getSymbolicName() + " stopped successfully.";
    }

    @GraphQLField
    @GraphQLName("refresh")
    public String refresh() {
        ModuleManager moduleManager = BundleUtils.getOsgiService("org.jahia.services.modulemanager.ModuleManager");
        if (moduleManager != null) {
            moduleManager.refresh(bundle.getSymbolicName(), null);
        }
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
