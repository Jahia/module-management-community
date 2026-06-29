package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.apache.felix.utils.resource.SimpleFilter;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.modulemanager.BundleBucketInfo;
import org.jahia.services.modulemanager.spi.BundleService;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleContext;
import org.osgi.framework.FrameworkUtil;
import org.osgi.framework.ServiceReference;
import org.osgi.framework.wiring.BundleRequirement;
import org.osgi.framework.wiring.BundleRevision;
import org.osgi.framework.wiring.FrameworkWiring;
import org.osgi.framework.wiring.BundleWire;
import org.osgi.framework.wiring.BundleWiring;

import javax.jcr.RepositoryException;
import java.util.*;
import java.util.function.Supplier;
import java.util.stream.Collectors;


public class GqlBundle {
    public static final String FILTER_DIRECTIVES = "filter";
    private static final String OSGI_WIRING_PACKAGE = "osgi.wiring.package";
    private static final String JAHIA_MODULES_DEPENDENCIES = "com.jahia.modules.dependencies";
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

    private ModuleManagementCommunityService moduleManagementCommunityService() {
        return BundleUtils.getOsgiService(ModuleManagementCommunityService.class, null);
    }

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
    @GraphQLName("type")
    public String getType() {
        String string = bundle.getHeaders().get("Jahia-Module-Type");
        return string!=null ? string : "bundle";
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
        BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
        if (bundleWiring != null) {
            // Bundle is resolved/active — return actual runtime wires
            for (BundleWire wire : bundleWiring.getRequiredWires(OSGI_WIRING_PACKAGE)) {
                wiring.add(wire.getProviderWiring().toString());
            }
        } else {
            // Bundle is unresolved (e.g. INSTALLED) — fall back to declared manifest requirements
            BundleRevision bundleRevision = bundle.adapt(BundleRevision.class);
            if (bundleRevision != null) {
                for (BundleRequirement req : bundleRevision.getDeclaredRequirements(OSGI_WIRING_PACKAGE)) {
                    String filter = req.getDirectives().get(FILTER_DIRECTIVES);
                    if (filter != null) wiring.add(filter);
                }
            }
        }
        return wiring;
    }

    @GraphQLField
    @GraphQLName("dependenciesGraph")
    public String getDependencyGraph(@GraphQLName("depth") @GraphQLDefaultValue(DefaultDepthSupplier.class) int depth) {
        StringBuilder mermaid = getMermaid();
        Set<String> visited = new HashSet<>();
        buildGraph(bundle, mermaid, visited, 0, depth, OSGI_WIRING_PACKAGE);
        return mermaid.toString();
    }

    @GraphQLField
    @GraphQLName("moduleDependencies")
    public SortedSet<String> getModuleDependencies() {
        SortedSet<String> wiring = new TreeSet<>();
        BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
        if (bundleWiring != null) {
            // Bundle is resolved/active — return actual runtime wires
            for (BundleWire wire : bundleWiring.getRequiredWires(JAHIA_MODULES_DEPENDENCIES)) {
                wiring.add(wire.getProviderWiring().toString());
            }
        } else {
            // Bundle is unresolved (e.g. INSTALLED) — fall back to declared manifest requirements
            BundleRevision bundleRevision = bundle.adapt(BundleRevision.class);
            if (bundleRevision != null) {
                for (BundleRequirement req : bundleRevision.getDeclaredRequirements(JAHIA_MODULES_DEPENDENCIES)) {
                    String filter = req.getDirectives().get(FILTER_DIRECTIVES);
                    if (filter != null) wiring.add(filter);
                }
            }
        }
        return wiring;
    }

    @GraphQLField
    @GraphQLName("moduleDependenciesGraph")
    public String getModuleDependencyGraph(@GraphQLName("depth") @GraphQLDefaultValue(DefaultDepthSupplier.class) int depth) {
        StringBuilder mermaid = getMermaid();
        Set<String> visited = new HashSet<>();
        buildGraph(bundle, mermaid, visited, 0, depth, JAHIA_MODULES_DEPENDENCIES);
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
        BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
        if (bundleWiring != null) {
            // Bundle is resolved/active — extract value from actual runtime wires
            for (BundleWire wire : bundleWiring.getRequiredWires("com.jahia.services.content")) {
                wiring.add(SimpleFilter.parse(wire.getRequirement().getDirectives().get(FILTER_DIRECTIVES)).getValue().toString());
            }
        } else {
            // Bundle is unresolved (e.g. INSTALLED) — fall back to declared manifest requirements
            BundleRevision bundleRevision = bundle.adapt(BundleRevision.class);
            if (bundleRevision != null) {
                for (BundleRequirement req : bundleRevision.getDeclaredRequirements("com.jahia.services.content")) {
                    String filter = req.getDirectives().get(FILTER_DIRECTIVES);
                    if (filter != null) wiring.add(SimpleFilter.parse(filter).getValue().toString());
                }
            }
        }
        return wiring;
    }

    /**
     * Returns all requirements that are declared in the bundle manifest but not currently wired.
     * For each unresolved requirement, {@code hasProviders} indicates whether at least one bundle
     * in the framework could satisfy it — helping distinguish "missing dependency" from
     * "dependency present but unresolvable due to a conflict or ordering issue".
     */
    @GraphQLField
    @GraphQLName("unresolvedRequirements")
    public List<GqlUnresolvedRequirement> getUnresolvedRequirements() {
        List<GqlUnresolvedRequirement> result = new ArrayList<>();

        BundleRevision bundleRevision = bundle.adapt(BundleRevision.class);
        if (bundleRevision == null) return result;

        // Collect requirements that are already satisfied via active wires
        Set<BundleRequirement> wiredRequirements = new HashSet<>();
        BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
        if (bundleWiring != null) {
            for (BundleWire wire : bundleWiring.getRequiredWires(null)) {
                wiredRequirements.add(wire.getRequirement());
            }
        }

        // Use our own class's bundle context to reach the system bundle.
        // We must NOT use bundle.getBundleContext() here: it returns null for bundles
        // in INSTALLED or RESOLVED state, which is precisely when this method matters most.
        BundleContext ownContext = FrameworkUtil.getBundle(GqlBundle.class).getBundleContext();
        FrameworkWiring frameworkWiring = ownContext != null
                ? ownContext.getBundle(0).adapt(FrameworkWiring.class)
                : null;

        for (BundleRequirement req : bundleRevision.getDeclaredRequirements(null)) {
            // already satisfied or
            // Skip service requirements entirely: OSGi services are managed through the
            // service registry, not through bundle wiring. getRequiredWires(null) never
            // returns service wires, so service requirements would always appear "unresolved"
            // even for a perfectly healthy ACTIVE bundle — producing false positives.
            if (wiredRequirements.contains(req) || "osgi.service".equals(req.getNamespace())) continue;

            String filter = req.getDirectives().get(FILTER_DIRECTIVES);
            String resolution = req.getDirectives().get("resolution");
            boolean optional = "optional".equals(resolution);

            // Check whether any bundle in the framework could satisfy this requirement
            boolean hasProviders = frameworkWiring != null && !frameworkWiring.findProviders(req).isEmpty();

            result.add(new GqlUnresolvedRequirement(req.getNamespace(), filter, optional, hasProviders));
        }

        return result;
    }

    @GraphQLName("GqlUnresolvedRequirement")
    public static class GqlUnresolvedRequirement {
        private final String namespace;
        private final String filter;
        private final boolean optional;
        private final boolean hasProviders;

        public GqlUnresolvedRequirement(String namespace, String filter, boolean optional, boolean hasProviders) {
            this.namespace = namespace;
            this.filter = filter;
            this.optional = optional;
            this.hasProviders = hasProviders;
        }

        /** OSGi namespace of the requirement, e.g. {@code osgi.wiring.package}, {@code com.jahia.modules.dependencies}. */
        @GraphQLField
        @GraphQLName("namespace")
        public String getNamespace() {
            return namespace;
        }

        /** Raw OSGi filter string from the manifest, e.g. {@code (&(osgi.wiring.package=com.example)(version>=1.0.0))}. */
        @GraphQLField
        @GraphQLName(FILTER_DIRECTIVES)
        public String getFilter() {
            return filter;
        }

        /** {@code true} if the requirement is declared optional — the bundle can still start without it. */
        @GraphQLField
        @GraphQLName("optional")
        public boolean isOptional() {
            return optional;
        }

        /**
         * {@code true} if at least one bundle in the framework exports a capability matching this requirement.
         * When {@code false} the dependency is completely absent and must be installed.
         * When {@code true} but the bundle is still unresolved, there is likely a version conflict or
         * a circular dependency preventing resolution.
         */
        @GraphQLField
        @GraphQLName("hasProviders")
        public boolean isHasProviders() {
            return hasProviders;
        }
    }

    @GraphQLField
    @GraphQLName("license")
    public String getLicense() {
        String license = "Unknown";
        if (bundle.adapt(BundleWiring.class) != null) {
            BundleWiring bundleWiring = bundle.adapt(BundleWiring.class);
            for (BundleWire revision : bundleWiring.getRequiredWires("org.jahia.license")) {
                license = SimpleFilter.parse(revision.getRequirement().getDirectives().get(FILTER_DIRECTIVES)).getValue().toString();
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

    @GraphQLField
    @GraphQLName("previousVersions")
    public List<GqlBundleVersion> getPreviousVersions() {
        try {
            return moduleManagementCommunityService().getBundleVersionsFromJcr(bundle)
                    .stream().map(GqlBundleVersion::new).collect(Collectors.toList());
        } catch (RepositoryException e) {
            throw new DataFetchingException("Error retrieving previous versions from JCR", e);
        }
    }

    @GraphQLField
    @GraphQLName("storeVersions")
    public List<GqlStoreVersion> getStoreVersions() {
        return moduleManagementCommunityService().getStoreVersionsForBundle(bundle.getSymbolicName())
                .stream().map(GqlStoreVersion::new).collect(Collectors.toList());
    }

    @GraphQLName("GqlStoreVersion")
    public static class GqlStoreVersion {
        private final Map<String, String> data;

        public GqlStoreVersion(Map<String, String> data) {
            this.data = data;
        }

        @GraphQLField
        @GraphQLName("version")
        public String getVersion() {
            return data.get("version");
        }

        /** Jahia store page URL for this module (same for all versions). */
        @GraphQLField
        @GraphQLName("storeUrl")
        public String getStoreUrl() {
            return data.get("storeUrl");
        }

        /** Direct download URL from the store catalogue — resolved server-side during install. */
        @GraphQLField
        @GraphQLName("downloadUrl")
        public String getDownloadUrl() {
            return data.get("downloadUrl");
        }
    }

    @GraphQLName("GqlBundleVersion")
    public static class GqlBundleVersion {
        private final Map<String, Object> data;

        public GqlBundleVersion(Map<String, Object> data) {
            this.data = data;
        }

        @GraphQLField
        @GraphQLName("version")
        public String getVersion() {
            return (String) data.get("version");
        }

        @GraphQLField
        @GraphQLName("jcrPath")
        public String getJcrPath() {
            return (String) data.get("jcrPath");
        }

        @GraphQLField
        @GraphQLName("fileName")
        public String getFileName() {
            return (String) data.get("fileName");
        }

        @GraphQLField
        @GraphQLName("size")
        public Long getSize() {
            return (Long) data.get("size");
        }

        @GraphQLField
        @GraphQLName("lastModified")
        public String getLastModified() {
            return (String) data.get("lastModified");
        }
    }

    @GraphQLField()
    @GraphQLName("sitesDeployment")
    public SortedSet<GqlSiteDeployment> getSitesDeployment() {
        SortedSet<GqlSiteDeployment> sites = new TreeSet<>();
        try {
            moduleManagementCommunityService().getSitesDeployment(bundle).entrySet().forEach(stringBooleanEntry -> {
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
                    // Strip groupId prefix (groupId/symbolicName/version → symbolicName/version)
                    // only when there are at least two slashes; plain symbolicName/version keys are left as-is
                    int firstSlash = bundleKey.indexOf('/');
                    if (firstSlash >= 0 && bundleKey.indexOf('/', firstSlash + 1) >= 0) {
                        bundleKey = bundleKey.substring(firstSlash + 1);
                    }
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

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof GqlSiteDeployment)) return false;
            GqlSiteDeployment that = (GqlSiteDeployment) o;
            return Objects.equals(this.siteKey, that.siteKey);
        }

        @Override
        public int hashCode() {
            return Objects.hash(siteKey);
        }
    }
}
