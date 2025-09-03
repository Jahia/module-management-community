package org.jahia.support.modulemanagement.cli;


import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Command;
import org.apache.karaf.shell.api.action.Option;
import org.apache.karaf.shell.api.action.lifecycle.Reference;
import org.apache.karaf.shell.api.action.lifecycle.Service;
import org.jahia.osgi.BundleUtils;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityServiceImpl;

@Command(scope = "jahia", name = "module-community-update", description = "Update modules in the Jahia community edition")
@Service()
public class ModuleManagementCommunityUpdateCommand implements Action {

    @Reference(optional = true)
    private ModuleManagementCommunityService communityService;

    @Option(name = "--dryRun", description = "Perform a dry run without making any changes", required = false, multiValued = false)
    private boolean dryRun = false;

    @Option(name = "--force", description = "Force update all modules, even if they are up to date", required = false, multiValued = false)
    private boolean force = false;

    @Option(name = "--clean", description = "Clean up old module versions after update and autostart new version", required = false, multiValued = false)
    private boolean clean = false;

    @Option(name = "--refresh", description = "Refresh the module list before checking for updates", required = false, multiValued = false)
    private boolean refresh = false;

    @Override
    public Object execute() throws Exception {
        if (communityService == null) {
            communityService = BundleUtils.getOsgiService(ModuleManagementCommunityServiceImpl.class, null);
            if (communityService == null) {
                throw new IllegalStateException("ModuleManagementCommunityService is not available. Please ensure the module is installed and active.");
            }
        }
        if (refresh) {
            return ((ModuleManagementCommunityServiceImpl) communityService).listAvailableUpdates(true, null, true);
        }
        return communityService.updateModules(true, dryRun, null, clean, clean, force);
    }
}
