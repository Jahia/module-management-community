package org.jahia.support.modulemanagement.config;


import org.osgi.service.metatype.annotations.AttributeDefinition;
import org.osgi.service.metatype.annotations.ObjectClassDefinition;

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
}
