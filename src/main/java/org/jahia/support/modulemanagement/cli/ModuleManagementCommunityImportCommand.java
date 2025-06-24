package org.jahia.support.modulemanagement.cli;


import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Argument;
import org.apache.karaf.shell.api.action.Command;
import org.apache.karaf.shell.api.action.Option;
import org.apache.karaf.shell.api.action.lifecycle.Reference;
import org.apache.karaf.shell.api.action.lifecycle.Service;
import org.jahia.osgi.BundleUtils;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityServiceImpl;

@Command(scope = "jahia", name = "module-community-import", description = "Import modules data")
@Service()
public class ModuleManagementCommunityImportCommand implements Action {

    @Reference(optional = true)
    private ModuleManagementCommunityService communityService;

    @Option(name = "--force", description = "Force import even if modules are already installed")
    private boolean force = false;

    @Argument(name = "bundleId", description = "The ID of the bundle to import", required = true)
    private long bundleId;

    @Override
    public Object execute() throws Exception {
        if (communityService == null) {
            communityService = BundleUtils.getOsgiService(ModuleManagementCommunityServiceImpl.class, null);
            if (communityService == null) {
                throw new IllegalStateException("ModuleManagementCommunityService is not available. Please ensure the module is installed and active.");
            }
        }
        return communityService.importModule(communityService.getBundleById(bundleId), force);
    }
}
