package org.jahia.support.modulemanagement.cli;


import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Command;
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

    @Override
    public Object execute() throws Exception {
        if (communityService == null) {
            communityService = BundleUtils.getOsgiService(ModuleManagementCommunityServiceImpl.class, null);
            if (communityService == null) {
                throw new IllegalStateException("ModuleManagementCommunityService is not available. Please ensure the module is installed and active.");
            }
        }
        return communityService.updateModules(true, true, null, false, false);
    }
}
