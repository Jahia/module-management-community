package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import graphql.annotations.annotationTypes.GraphQLNonNull;
import org.jahia.support.modulemanagement.UpdateModulesResult;

import java.util.Set;

@GraphQLName("UpdateModulesResult")
@GraphQLDescription("Result of an updateModules operation")
public class GqlUpdateModulesResult {

    private final UpdateModulesResult result;

    public GqlUpdateModulesResult(UpdateModulesResult result) {
        this.result = result;
    }

    @GraphQLField
    @GraphQLNonNull
    @GraphQLName("modules")
    @GraphQLDescription("List of module symbolic names that were (or would be) updated")
    public Set<String> getModules() {
        return result.getModules();
    }

    @GraphQLField
    @GraphQLName("yamlScript")
    @GraphQLDescription("The generated provisioning YAML script. In dry-run mode no changes are applied; in live mode this script was written to the patches folder.")
    public String getYamlScript() {
        return result.getYamlScript();
    }
}

