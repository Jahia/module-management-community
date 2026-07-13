package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.support.modulemanagement.UpdateModulesResult;
import org.junit.Test;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * S24 — the GraphQL result type exposes fields named {@code modules} and {@code yamlScript}
 * (NOT {@code yaml}). Documents the D4 field-name divergence and guards the delegation.
 */
public class GqlUpdateModulesResultTest {

    @Test
    public void gettersDelegateToUnderlyingResult() {
        Set<String> modules = Collections.singleton("org.example.mod");
        GqlUpdateModulesResult result =
                new GqlUpdateModulesResult(new UpdateModulesResult(modules, "yaml-content"));

        assertThat(result.getModules()).containsExactly("org.example.mod");
        assertThat(result.getYamlScript()).isEqualTo("yaml-content");
    }

    @Test
    public void graphQlFieldNames_areModulesAndYamlScript_notYaml() throws Exception {
        String modulesName = GqlUpdateModulesResult.class.getMethod("getModules")
                .getAnnotation(GraphQLName.class).value();
        String yamlScriptName = GqlUpdateModulesResult.class.getMethod("getYamlScript")
                .getAnnotation(GraphQLName.class).value();

        assertThat(modulesName).isEqualTo("modules");
        assertThat(yamlScriptName).isEqualTo("yamlScript");

        // There must be no field literally named "yaml".
        for (Method m : GqlUpdateModulesResult.class.getMethods()) {
            GraphQLName ann = m.getAnnotation(GraphQLName.class);
            if (ann != null) {
                assertThat(ann.value()).isNotEqualTo("yaml");
            }
        }
    }
}
