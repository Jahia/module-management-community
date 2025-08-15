package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.apache.karaf.cellar.bundle.BundleState;
import org.apache.karaf.cellar.core.CellarSupport;
import org.apache.karaf.cellar.core.ClusterManager;
import org.apache.karaf.cellar.core.Group;
import org.apache.karaf.cellar.core.event.EventType;
import org.jahia.osgi.BundleUtils;
import org.jahia.utils.ClassLoaderUtils;
import org.osgi.framework.Bundle;
import org.osgi.service.cm.ConfigurationAdmin;

import java.util.Map;

public class ClusteredGqlBundle extends GqlBundle {

    public ClusteredGqlBundle(Bundle bundle) {
        super(bundle);
    }

    @GraphQLField
    @GraphQLName("clusterState")
    @Override
    public BundleState getClusterState() {
        return ClassLoaderUtils.executeWith(this.getClass().getClassLoader(), () -> {
            BundleState cellarState;
            ClusterManager clusterManager = (ClusterManager) BundleUtils.getOsgiService("org.apache.karaf.cellar.core.ClusterManager", null);
            Map<String, org.apache.karaf.cellar.bundle.BundleState> clusterBundles = clusterManager.getMap("org.apache.karaf.cellar.bundle.map.default");
            CellarSupport cellarSupport = new CellarSupport();
            cellarSupport.setClusterManager(clusterManager);
            cellarSupport.setConfigurationAdmin(BundleUtils.getOsgiService(ConfigurationAdmin.class, null));
            boolean isAllowed = cellarSupport.isAllowed(new Group("default"), "bundle", bundle.getLocation(), EventType.INBOUND);
            if (isAllowed) {
                String key = bundle.getSymbolicName() + "/" + bundle.getVersion();
                String alternateKey = bundle.getSymbolicName() + "/" + bundle.getHeaders().get("Bundle-Version");
                if (clusterBundles.containsKey(key)) {
                    cellarState = BundleState.fromBundleState(clusterBundles.get(key).getStatus());
                } else if (clusterBundles.containsKey(alternateKey)) {
                    cellarState = BundleState.fromBundleState(clusterBundles.get(alternateKey).getStatus());
                } else {
                    // If the bundle is not found in the cluster map, we assume it's not deployed in the cluster
                    cellarState = BundleState.INSTALLED;
                }
            } else {
                cellarState = BundleState.UNKNOWN;
            }
            return cellarState;
        });
    }
}
