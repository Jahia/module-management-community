package org.jahia.support.modulemanagement.services;

import org.jahia.osgi.BundleUtils;
import org.jahia.services.scheduler.BackgroundJob;
import org.jahia.services.scheduler.SchedulerService;
import org.jahia.api.settings.SettingsBean;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.osgi.service.component.annotations.*;
import org.quartz.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.text.ParseException;
import java.util.Map;

@Component(service = RefreshModuleUpdatesInBackground.class, immediate = true, configurationPid = "org.jahia.support.modulemanagement.services.RefreshModuleUpdatesInBackground", configurationPolicy = ConfigurationPolicy.REQUIRE)
public class RefreshModuleUpdatesInBackground extends BackgroundJob {

    private static final Logger logger = LoggerFactory.getLogger(RefreshModuleUpdatesInBackground.class);

    @Reference
    private SchedulerService schedulerService;
    @Reference
    private SettingsBean settingsBean;
    private JobDetail jobDetail;

    @Activate
    public void activate(Map<String, String> properties) throws ParseException, SchedulerException {
        jobDetail = BackgroundJob.createJahiaJob("Background job to refresh list of module updates available", RefreshModuleUpdatesInBackground.class);
        if (schedulerService.getAllJobs(jobDetail.getGroup()).isEmpty() && settingsBean.isProcessingServer()) {
            String refreshModuleUpdatesInBackgroundCron = properties.getOrDefault("refreshModuleUpdatesInBackgroundCron", "0 0 2 * * ?");
            Trigger trigger = new CronTrigger("RefreshModuleUpdatesInBackgroundTrigger", jobDetail.getGroup(), refreshModuleUpdatesInBackgroundCron);
            schedulerService.getScheduler().scheduleJob(jobDetail, trigger);
            logger.info("Scheduled background job to refresh module updates with cron expression: {}", refreshModuleUpdatesInBackgroundCron);
        }
    }

    @Deactivate
    public void stop() throws SchedulerException {
        if (!schedulerService.getAllJobs(jobDetail.getGroup()).isEmpty() && settingsBean.isProcessingServer()) {
            schedulerService.getScheduler().deleteJob(jobDetail.getName(), jobDetail.getGroup());
        }
    }

    @Override
    public void executeJahiaJob(JobExecutionContext jobExecutionContext) throws Exception {
        ModuleManagementCommunityService moduleManagementService =
                BundleUtils.getOsgiService(ModuleManagementCommunityService.class, null);
        if (moduleManagementService == null) {
            logger.warn("ModuleManagementCommunityService not available — skipping store index refresh");
            return;
        }
        logger.info("Starting background job: refreshing store module index");
        moduleManagementService.refreshStoreIndex();
        logger.info("Finished background job: store module index refreshed");
    }
}
