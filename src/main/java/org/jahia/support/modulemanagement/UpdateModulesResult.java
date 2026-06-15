package org.jahia.support.modulemanagement;

import java.util.Set;

/**
 * Result of an updateModules operation, containing both the list of affected modules
 * and the generated provisioning YAML script (always populated, both in dry-run and live modes).
 */
public class UpdateModulesResult {

    private final Set<String> modules;
    private final String yamlScript;

    public UpdateModulesResult(Set<String> modules, String yamlScript) {
        this.modules = modules;
        this.yamlScript = yamlScript;
    }

    public Set<String> getModules() {
        return modules;
    }

    public String getYamlScript() {
        return yamlScript;
    }
}

