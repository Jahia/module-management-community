package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.apache.felix.utils.resource.SimpleFilter;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.modulemanager.BundleBucketInfo;
import org.jahia.services.modulemanager.spi.BundleService;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.jahia.utils.ClassLoaderUtils;
import org.osgi.framework.Bundle;
import org.osgi.framework.ServiceReference;
import org.osgi.framework.wiring.BundleWire;
import org.osgi.framework.wiring.BundleWiring;

import javax.inject.Inject;
import javax.jcr.RepositoryException;
import java.util.*;
import java.util.function.Supplier;


public class GqlBundle {
    protected final Bundle bundle;

    public GqlBundle(Bundle bundle) {
        this.bundle = bundle;
    }

    public enum BundleState {
        ACTIVE("ACTIVE"),
        INSTALLED("INSTALLED"),
        RESOLVED("RESOLVED"),
        STARTING("STARTING"),
        STOPPING("STOPPING"),
        UNKNOWN("UNKNOWN");

        private final String label;

        BundleState(String label) {
            this.label = label;
        }

        public String getLabel() {
            return label;
        }

        public static BundleState fromBundleState(int state) {
            switch (state) {
                case Bundle.ACTIVE:
                    return ACTIVE;
                case Bundle.INSTALLED:
                    return INSTALLED;
                case Bundle.RESOLVED:
                    return RESOLVED;
                case Bundle.STARTING:
                    return STARTING;
                case Bundle.STOPPING:
                    return STOPPING;
                default:
                    return UNKNOWN;
            }
        }
    }

    @Inject
    @GraphQLOsgiService(service = ModuleManagementCommunityService.class)
    ModuleManagementCommunityService moduleManagementCommunityService;

    @GraphQLField
    @GraphQLName("symbolicName")
    public String getSymbolicName() {
        return bundle.getSymbolicName();
    }

    @GraphQLField
    @GraphQLName("bundleId")
    public long getBundleId() {
        return bundle.getBundleId();
    }

    @GraphQLField
    @GraphQLName("version")
    public String getVersion() {
        return bundle.getVersion().toString();
    }

    @GraphQLField
    @GraphQLName("state")
    public BundleState getState() {
        return BundleState.fromBundleState(bundle.getState());
    }

    @GraphQLField
    @GraphQLName("manifest")
    public List<GqlManifestHeader> getManifest(@GraphQLName("keys") List<String> includeKeys) {
        Enumeration<String> keys = bundle.getHeaders().keys();
        List<GqlManifestHeader> manifest = new ArrayList<>();
        while (keys.hasMoreElements()) {
            String key = keys.nextElement();
            if (includeKeys != null && !includeKeys.isEmpty() && !includeKeys.contains(key)) {
                continue; // Skip keys not in the include list
            }
            manifest.add(new GqlManifestHeader(key, bundle.getHeaders().get(key)));
        }
        return manifest;
    }

    @GraphQLField
    @GraphQLName("dependencies")
    public SortedSet<String> getDependencies() {
        SortedSet<String> wiring = new TreeSet<>();
        if (bundle.adapt(BundleWiring.class) != null) {
            BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
            for (BundleWire revision : bundleWiring.getRequiredWires("osgi.wiring.package")) {
                wiring.add(revision.getProviderWiring().toString());
            }
        }
        return wiring;
    }

    @GraphQLField
    @GraphQLName("dependenciesGraph")
    public String getDependencyGraph(@GraphQLName("depth") @GraphQLDefaultValue(DefaultDepthSupplier.class) int depth) {
        StringBuilder mermaid = getMermaid();
        Set<String> visited = new HashSet<>();
        buildGraph(bundle, mermaid, visited, 0, depth, "osgi.wiring.package");
        return mermaid.toString();
    }

    @GraphQLField
    @GraphQLName("moduleDependencies")
    public SortedSet<String> getModuleDependencies() {
        SortedSet<String> wiring = new TreeSet<>();
        if (bundle.adapt(BundleWiring.class) != null) {
            BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
            for (BundleWire revision : bundleWiring.getRequiredWires("com.jahia.modules.dependencies")) {
                wiring.add(revision.getProviderWiring().toString());
            }
        }
        return wiring;
    }

    @GraphQLField
    @GraphQLName("moduleDependenciesGraph")
    public String getModuleDependencyGraph(@GraphQLName("depth") @GraphQLDefaultValue(DefaultDepthSupplier.class) int depth) {
        StringBuilder mermaid = getMermaid();
        Set<String> visited = new HashSet<>();
        buildGraph(bundle, mermaid, visited, 0, depth, "com.jahia.modules.dependencies");
        return mermaid.toString();
    }

    private static StringBuilder getMermaid() {
        StringBuilder mermaid = new StringBuilder();
        mermaid.append("---\n").append("config:\n").append("  look: handDrawn\n").append("  theme: neutral\n").append("  layout: elk\n").append("  elk:\n").append("    mergeEdges: true\n").append("    nodePlacementStrategy: LINEAR_SEGMENTS\n").append("---\n");
        mermaid.append("flowchart LR\n");
        return mermaid;
    }

    private void buildGraph(Bundle bundle, StringBuilder mermaid, Set<String> visited, int level, int maxLevel, String namespace) {
        if (level >= maxLevel) return;
        String from = bundle.getSymbolicName();
        if (!visited.add(from + ":" + level)) return; // Prevent cycles at this level
        if (bundle.adapt(BundleWiring.class) != null) {
            BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
            for (BundleWire revision : bundleWiring.getRequiredWires(namespace)) {
                Bundle required = revision.getProviderWiring().getBundle();
                String requiredSymbolicName = required.getSymbolicName();
                if (visited.add(requiredSymbolicName + ":" + level)) {
                    mermaid.append("    ").append(from).append("([").append(from).append("])").append(" --> ").append(requiredSymbolicName).append("([").append(requiredSymbolicName).append("])").append("\n");
                    buildGraph(required, mermaid, visited, level + 1, maxLevel, namespace);
                }
            }
        }
    }

    @GraphQLField
    @GraphQLName("nodeTypesDependencies")
    public SortedSet<String> getNodeTypeDependencies() {
        SortedSet<String> wiring = new TreeSet<>();
        if (bundle.adapt(BundleWiring.class) != null) {
            BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
            for (BundleWire revision : bundleWiring.getRequiredWires("com.jahia.services.content")) {
                wiring.add(SimpleFilter.parse(revision.getRequirement().getDirectives().get("filter")).getValue().toString());
            }
        }
        return wiring;
    }

    @GraphQLField
    @GraphQLName("license")
    public String getLicense() {
        String license = "Unknown";
        if (bundle.adapt(BundleWiring.class) != null) {
            BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
            for (BundleWire revision : bundleWiring.getRequiredWires("org.jahia.license")) {
                license = SimpleFilter.parse(revision.getRequirement().getDirectives().get("filter")).getValue().toString();
            }
        }
        return license;
    }

    @GraphQLField
    @GraphQLName("services")
    public SortedSet<String> getServices() {
        SortedSet<String> services = new TreeSet<>();
        ServiceReference<?>[] registeredServices = bundle.getRegisteredServices();
        if (registeredServices == null) {
            return services; // Return empty set if no services are registered
        }
        Arrays.stream(registeredServices).map(serviceReference -> ((String[]) serviceReference.getProperties().get("objectClass"))[0]).forEach(services::add);
        return services;
    }

    @GraphQLField
    @GraphQLName("servicesInUse")
    public SortedSet<String> getServicesInUse() {
        SortedSet<String> services = new TreeSet<>();
        ServiceReference<?>[] inUse = bundle.getServicesInUse();
        if (inUse != null) {
            Arrays.stream(inUse).map(serviceReference -> ((String[]) serviceReference.getProperties().get("objectClass"))[0]).forEach(services::add);
        }
        return services;
    }

    @GraphQLField()
    @GraphQLName("sitesDeployment")
    public SortedSet<GqlSiteDeployment> getSitesDeployment() {
        SortedSet<GqlSiteDeployment> sites = new TreeSet<>();
        try {
            moduleManagementCommunityService.getSitesDeployment(bundle).entrySet().forEach(stringBooleanEntry -> {
                String siteKey = stringBooleanEntry.getKey();
                boolean isDeployed = stringBooleanEntry.getValue();
                sites.add(new GqlSiteDeployment(siteKey, isDeployed));
            });
        } catch (RepositoryException e) {
            throw new DataFetchingException(e);
        }
        return sites;
    }

    @GraphQLField
    @GraphQLName("clusterDeployment")
    public List<GqlClusterNode> getClusterDeployment() {
        List<GqlClusterNode> result = new ArrayList<>();

        org.jahia.services.modulemanager.spi.BundleService bundleService = (org.jahia.services.modulemanager.spi.BundleService) BundleUtils.getOsgiService("org.jahia.services.modulemanager.spi.BundleService", "(clustered=true)");

        if (bundleService != null) {
            Map<String, Map<String, BundleService.BundleInformation>> infos = bundleService.getInfos(new BundleBucketInfo(BundleUtils.getModuleGroupId(bundle), bundle.getSymbolicName()), null);

            for (Map.Entry<String, Map<String, BundleService.BundleInformation>> nodeEntry : infos.entrySet()) {
                String nodeId = nodeEntry.getKey();
                List<GqlBundleInfo> bundleInfos = new ArrayList<>();

                for (Map.Entry<String, BundleService.BundleInformation> bundleEntry : nodeEntry.getValue().entrySet()) {
                    String bundleKey = bundleEntry.getKey();
                    BundleService.BundleInformation bundleInfo = bundleEntry.getValue();

                    bundleInfos.add(new GqlBundleInfo(bundleKey, bundleInfo));
                }

                result.add(new GqlClusterNode(nodeId, bundleInfos));
            }
        }

        return result;
    }

    @GraphQLField
    @GraphQLName("clusterState")
    public BundleState getClusterState() {
        return BundleState.UNKNOWN;
    }

    @GraphQLName("GqlClusterNode")
    private class GqlClusterNode {
        @GraphQLField
        @GraphQLName("nodeId")
        private final String nodeId;

        @GraphQLField
        @GraphQLName("bundles")
        private final List<GqlBundleInfo> bundles;

        public GqlClusterNode(String nodeId, List<GqlBundleInfo> bundles) {
            this.nodeId = nodeId;
            this.bundles = bundles;
        }
    }

    @GraphQLName("GqlBundleInfo")
    private class GqlBundleInfo {
        @GraphQLField
        @GraphQLName("key")
        private final String key;

        @GraphQLField
        @GraphQLName("state")
        private final String state;

        public GqlBundleInfo(String key, BundleService.BundleInformation info) {
            this.key = key;
            this.state = info.getOsgiState() != null ? info.getOsgiState().name() : "UNKNOWN";
        }
    }


    private class GqlManifestHeader {
        @GraphQLField
        private final String key;
        @GraphQLField
        private final String value;

        public GqlManifestHeader(String key, String value) {
            this.key = key;
            this.value = value;
        }
    }

    public static class DefaultDepthSupplier implements Supplier<Object> {

        @Override
        public Integer get() {
            return 3;
        }
    }

    private class GqlSiteDeployment implements Comparable<GqlSiteDeployment> {
        @GraphQLField
        private final String siteKey;
        @GraphQLField
        private final boolean isDeployed;

        public GqlSiteDeployment(String siteKey, boolean isDeployed) {
            this.siteKey = siteKey;
            this.isDeployed = isDeployed;
        }

        @Override
        public int compareTo(GqlSiteDeployment o) {
            return this.siteKey.compareTo(o.siteKey);
        }
    }
}
