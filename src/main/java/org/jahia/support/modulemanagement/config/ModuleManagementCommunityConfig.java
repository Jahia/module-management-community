package org.jahia.support.modulemanagement.config;


import org.osgi.service.metatype.annotations.AttributeDefinition;
import org.osgi.service.metatype.annotations.ObjectClassDefinition;

import java.util.List;

@ObjectClassDefinition(
        name = "Module Management Community Configuration",
        description = "Configuration for the Module Management Community features")
public @interface ModuleManagementCommunityConfig {
    @AttributeDefinition(
            name = "Update on Module Startup",
            description = "Enable/Disable updates of modules on module startup. " +
                    "If enabled, the system will check for updates and apply them automatically when the module starts."
    )
    boolean updateOnModuleStartup() default true;

    @AttributeDefinition(
            name = "Excluded Modules",
            description = "List of module package names that should be excluded from automatic updates on module startup. " +
                    "Modules listed here will not be updated even if updates are available."
    )
    String excludedModules() default "";

    @AttributeDefinition(
            name = "Limit number of modules to update",
            description = "Limit the number of modules to update during a single update check. " +
                    "This helps to control the update process and avoid overwhelming the system with too many updates at once. 0 means no limit."
    )
    int maxModulesToUpdate() default 10;

}
