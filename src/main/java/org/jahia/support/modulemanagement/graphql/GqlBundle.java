package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.apache.felix.utils.resource.SimpleFilter;
import org.osgi.framework.Bundle;
import org.osgi.framework.wiring.BundleWire;
import org.osgi.framework.wiring.BundleWiring;

import java.util.*;


public class GqlBundle {
    private final Bundle bundle;

    public GqlBundle(Bundle bundle) {
        this.bundle = bundle;
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
    public String getState() {
        return bundle.getState() == Bundle.ACTIVE ? "ACTIVE" : bundle.getState() == Bundle.INSTALLED ? "INSTALLED" : bundle.getState() == Bundle.RESOLVED ? "RESOLVED" : bundle.getState() == Bundle.STARTING ? "STARTING" : bundle.getState() == Bundle.STOPPING ? "STOPPING" : "UNKNOWN";
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
        Arrays.stream(bundle.getRegisteredServices()).map(serviceReference -> ((String[]) serviceReference.getProperties().get("objectClass"))[0]).forEach(services::add);
        return services;
    }

    @GraphQLField
    @GraphQLName("servicesInUse")
    public SortedSet<String> getServicesInUse() {
        SortedSet<String> services = new TreeSet<>();
        Arrays.stream(bundle.getServicesInUse()).map(serviceReference -> ((String[]) serviceReference.getProperties().get("objectClass"))[0]).forEach(services::add);
        return services;
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
}
