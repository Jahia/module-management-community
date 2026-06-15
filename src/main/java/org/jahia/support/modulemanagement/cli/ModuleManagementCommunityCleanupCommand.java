package org.jahia.support.modulemanagement.cli;

import org.apache.karaf.shell.api.action.Action;
import org.apache.karaf.shell.api.action.Command;
import org.apache.karaf.shell.api.action.lifecycle.Reference;
import org.apache.karaf.shell.api.action.lifecycle.Service;
import org.jahia.osgi.BundleUtils;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityServiceImpl;

/**
 * Karaf shell command that removes old module versions from the JCR module-management store
 * ({@code /module-management/bundles/…}).
 *
 * <p>For each module the cleanup keeps:
 * <ol>
 *   <li>All versions currently installed in OSGi (any bundle state).</li>
 *   <li>At most one additional "previous" version (the most-recent one not yet in OSGi).</li>
 * </ol>
 *
 * <p>Usage from the Karaf/Felix console:
 * <pre>jahia:module-community-cleanup-jcr</pre>
 */
@Command(scope = "jahia",
         name = "module-community-cleanup-jcr",
         description = "Remove old module versions from the JCR module-management store, " +
                       "keeping only the current and one previous version per module")
@Service
public class ModuleManagementCommunityCleanupCommand implements Action {

    @Reference(optional = true)
    private ModuleManagementCommunityService communityService;

    @Override
    public Object execute() throws Exception {
        if (communityService == null) {
            communityService = BundleUtils.getOsgiService(ModuleManagementCommunityServiceImpl.class, null);
            if (communityService == null) {
                throw new IllegalStateException(
                        "ModuleManagementCommunityService is not available. " +
                        "Please ensure the module is installed and active.");
            }
        }
        return communityService.cleanupJcrVersions();
    }
}

