package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.apache.karaf.cellar.core.Configurations;
import org.apache.karaf.cellar.core.Group;
import org.apache.karaf.cellar.core.GroupManager;
import org.apache.karaf.cellar.core.Synchronizer;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;

import javax.inject.Inject;

public class ClusteredModuleManagementMutationResult extends  ModuleManagementMutationResult {

    @Inject
    @GraphQLOsgiService(service = org.apache.karaf.cellar.core.Synchronizer.class, filter = "(resource=bundle)")
    private Synchronizer cellarBundleSynchronizer;

    @Inject
    @GraphQLOsgiService(service = GroupManager.class)
    private GroupManager groupManager;

    @GraphQLField
    @GraphQLName("synchronizeBundles")
    public String synchronizeBundles() {
        if (cellarBundleSynchronizer != null) {
            Group group = groupManager.findGroupByName(Configurations.DEFAULT_GROUP_NAME);
            cellarBundleSynchronizer.sync(group);
            return "Bundles synchronization triggered successfully.";
        } else {
            return "Cellar bundle synchronizer is not available.";
        }
    }

    @GraphQLField
    @GraphQLName("pushBundles")
    public String pushBundles() {
        if (cellarBundleSynchronizer != null) {
            Group group = groupManager.findGroupByName(Configurations.DEFAULT_GROUP_NAME);
            cellarBundleSynchronizer.push(group);
            return "Bundles pushed to the cluster successfully.";
        } else {
            return "Cellar bundle synchronizer is not available.";
        }
    }

    @GraphQLField
    @GraphQLName("pullBundles")
    public String pullBundles() {
        if (cellarBundleSynchronizer != null) {
            Group group = groupManager.findGroupByName(Configurations.DEFAULT_GROUP_NAME);
            cellarBundleSynchronizer.pull(group);
            return "Bundles pulled from the cluster successfully.";
        } else {
            return "Cellar bundle synchronizer is not available.";
        }
    }
}
