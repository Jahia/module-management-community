package org.jahia.support.modulemanagement.services;


import org.apache.commons.io.FileUtils;
import org.jahia.bin.Jahia;
import org.jahia.osgi.FrameworkService;
import org.jahia.services.provisioning.ProvisioningManager;
import org.jahia.settings.SettingsBean;
import org.osgi.framework.Constants;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.event.EventConstants;
import org.osgi.service.event.EventHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import static org.jahia.support.modulemanagement.services.ModuleManagementCommunityServiceImpl.SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE;

@Component(name = "org.jahia.support.modulemanagement.clustering.patcher", service = EventHandler.class, property = {
        Constants.SERVICE_PID + "=org.jahia.support.modulemanagement.clustering.patcher",
        Constants.SERVICE_DESCRIPTION + "=Jahia Cluster Wide Update On Startup",
        Constants.SERVICE_VENDOR + "=" + Jahia.VENDOR_NAME,
        EventConstants.EVENT_TOPIC + "=" + FrameworkService.EVENT_TOPIC_LIFECYCLE,
        EventConstants.EVENT_FILTER + "=(type=" + FrameworkService.EVENT_TYPE_CLUSTER_STARTED + ")"}, immediate = true)
public class ClusterWideUpdateOnStartup implements EventHandler {
    private final Logger logger = LoggerFactory.getLogger(ClusterWideUpdateOnStartup.class);
    @Reference
    ProvisioningManager provisioningManager;

    @Override
    public void handleEvent(org.osgi.service.event.Event event) {
        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            logger.warn(SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE);
            return;
        }
        if (!settingsBean.isProcessingServer() && !settingsBean.isClusterActivated()) {
            logger.warn("ModuleManagementCommunityService is available only on processing servers");
            return;
        }
        Path path = Path.of(settingsBean.getJahiaVarDiskPath(), "patches", "provisioning", ModuleManagementCommunityServiceImpl.CLUSTER_SYNCHRONIZED_YAML_SKIPPED);
        if (path.toFile().exists()) {
            try {
                Path renamePath = Path.of(settingsBean.getJahiaVarDiskPath(), "patches", "provisioning", ModuleManagementCommunityServiceImpl.CLUSTER_SYNCHRONIZED_YAML);
                if(path.toFile().renameTo(renamePath.toFile())) {
                    logger.info("Cluster wide update on startup executed successfully. Monitor results for patch file: {}", renamePath);
                } else {
                    logger.warn("Could not rename {} to {}", ModuleManagementCommunityServiceImpl.CLUSTER_SYNCHRONIZED_YAML_SKIPPED, ModuleManagementCommunityServiceImpl.CLUSTER_SYNCHRONIZED_YAML);
                }
            } catch (Exception e) {
                logger.error("Execution of cluster wide update on startup failed with error: {}", e.getMessage(), e);
            }
        } else {
            logger.info("No cluster wide update on startup script found at {}", path);
        }
    }
}
