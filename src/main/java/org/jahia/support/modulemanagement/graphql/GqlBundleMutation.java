package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleException;

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
}
