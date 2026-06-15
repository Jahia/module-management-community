package org.jahia.support.modulemanagement.services;

import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
import org.apache.felix.utils.collections.MapToDictionary;
import java.util.ArrayList;
import org.apache.karaf.features.Feature;
import org.apache.karaf.features.FeaturesService;
import org.apache.maven.artifact.repository.metadata.Versioning;
import org.apache.maven.artifact.repository.metadata.io.xpp3.MetadataXpp3Reader;
import org.codehaus.plexus.util.xml.pull.XmlPullParserException;
import org.eclipse.aether.artifact.Artifact;
import org.eclipse.aether.artifact.DefaultArtifact;
import org.eclipse.aether.util.version.GenericVersionScheme;
import org.eclipse.aether.version.InvalidVersionSpecificationException;
import org.eclipse.aether.version.Version;
import org.eclipse.aether.version.VersionConstraint;
import org.eclipse.aether.version.VersionScheme;
import org.jahia.api.Constants;
import org.jahia.data.templates.JahiaTemplatesPackage;
import org.jahia.exceptions.JahiaRuntimeException;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.osgi.BundleResource;
import org.jahia.osgi.BundleState;
import org.jahia.osgi.BundleUtils;
import org.jahia.osgi.FrameworkService;
import org.jahia.services.content.*;
import org.jahia.services.content.decorator.JCRSiteNode;
import org.jahia.services.modulemanager.BundleInfo;
import org.jahia.services.modulemanager.ModuleManager;
import org.jahia.services.modulemanager.spi.BundleService;
import org.jahia.services.provisioning.ProvisioningManager;
import org.jahia.services.query.QueryResultWrapper;
import org.jahia.services.sites.JahiaSite;
import org.jahia.services.sites.JahiaSitesService;
import org.jahia.services.templates.JahiaTemplateManagerService;
import org.jahia.services.usermanager.JahiaUser;
import org.jahia.services.usermanager.JahiaUserManagerService;
import org.jahia.settings.SettingsBean;
import org.jahia.support.modulemanagement.ModuleManagementCommunityService;
import org.jahia.support.modulemanagement.UpdateModulesResult;
import org.jahia.support.modulemanagement.config.ModuleManagementCommunityConfig;
import org.ops4j.pax.url.mvn.MavenResolver;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleContext;
import org.osgi.framework.startlevel.BundleStartLevel;
import org.osgi.service.cm.ConfigurationAdmin;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.ConfigurationPolicy;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.metatype.annotations.Designate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;

import javax.annotation.Nonnull;
import javax.jcr.RepositoryException;
import javax.jcr.query.Query;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;
import org.jahia.support.modulemanagement.ExportOptions;
import java.util.concurrent.CompletableFuture;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Component(service = ModuleManagementCommunityService.class, immediate = true, configurationPid = "org.jahia.support.modulemanagement.services.ModuleManagementCommunityService", configurationPolicy = ConfigurationPolicy.REQUIRE)
@Designate(ocd = ModuleManagementCommunityConfig.class)
public class ModuleManagementCommunityServiceImpl implements ModuleManagementCommunityService {
    public static final String SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE = "ModuleManagementCommunityService is not available in read-only mode";
    public static final String SNAPSHOT = "SNAPSHOT";
    public static final String INVALID_VERSION_SPECIFICATION = "Invalid version specification";
    public static final String CLUSTER_SYNCHRONIZED_YAML_SKIPPED = "module-management-community.clusterSynchronized.yaml.skipped"; // We need to use skipped suffix to avoid execution on startup before cluster is ready
    public static final String CLUSTER_SYNCHRONIZED_YAML = "module-management-community.clusterSynchronized.yaml";
    private final Logger logger = LoggerFactory.getLogger(ModuleManagementCommunityServiceImpl.class);

    @Reference
    ProvisioningManager provisioningManager;

    @Reference
    FeaturesService featuresService;

    @Reference
    JCRTemplate jcrTemplate;

    @Reference
    JahiaUserManagerService jahiaUserManagerService;

    @Reference
    JahiaTemplateManagerService jahiaTemplateManagerService;

    @Reference
    JahiaSitesService jahiaSitesService;

    @Reference
    ConfigurationAdmin configurationAdmin;

    private Instant lastUpdateTime = null;
    private Map<String, String> modulesWithUpdates;
    private BundleContext bundleContext;
    private Set<Pattern> excludeModules;
    private int maxModulesToUpdate;

    @Activate
    public void activate(ModuleManagementCommunityConfig config, BundleContext bundleContext) {
        this.bundleContext = bundleContext;
        logger.info("ModuleManagementCommunityService activated");
        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            logger.warn(SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE);
            return;
        }
        if (StringUtils.isEmpty(config.excludedModules())) {
            logger.info("No excluded modules configured for ModuleManagementCommunityService");
            excludeModules = Collections.emptySet();
        } else {
            logger.info("Excluded modules: {}", config.excludedModules());
            excludeModules = Arrays.stream(config.excludedModules().split(","))
                    .map(String::trim)
                    .filter(StringUtils::isNotEmpty)
                    .map(excludedModule -> excludedModule + "\\..*")
                    .map(Pattern::compile)
                    .collect(Collectors.toSet());
        }
        maxModulesToUpdate = config.maxModulesToUpdate();

        // If ModuleManagementCommunityConfig.refreshModuleUpdatesInBackgroundCronis set we need to create the configuration file to start the service
        if (config.refreshModuleUpdatesInBackgroundCron() != null) {
            try {
                Map<String, String> properties = new HashMap<>();
                properties.put("refreshModuleUpdatesInBackgroundCron", config.refreshModuleUpdatesInBackgroundCron());
                configurationAdmin.getConfiguration("org.jahia.support.modulemanagement.services.RefreshModuleUpdatesInBackground", null).updateIfDifferent(new MapToDictionary(properties));
                logger.info("Configuration for RefreshModuleUpdatesInBackground updated with cron expression: {}", config.refreshModuleUpdatesInBackgroundCron());
            } catch (IOException e) {
                logger.error("Error updating configuration for RefreshModuleUpdatesInBackground", e);
            }
        }

        if (settingsBean.isProcessingServer()) {
            if (config.updateOnModuleStartup()) {
                logger.info("ModuleManagementCommunityService is configured to update modules on startup");
                CompletableFuture.runAsync(() -> {
                    try {
                        updateModules(true, false, null, true, true, true, false);
                        logger.info("Modules update upon startup is done successfully");
                    } catch (IOException e) {
                        logger.error("Error updating modules on startup", e);
                    }
                }).exceptionally(ex -> {
                    logger.error("Error during module update on startup", ex);
                    return null;
                });
            } else {
                CompletableFuture.runAsync(() -> {
                    try {
                        listAvailableUpdates(true, null, true);
                        logger.info("Modules list refresh upon startup is done successfully");
                    } catch (IOException e) {
                        logger.error("Error updating modules on startup", e);
                    }
                }).exceptionally(ex -> {
                    logger.error("Error during module update on startup", ex);
                    return null;
                });
                logger.info("ModuleManagementCommunityService is not configured to update modules on startup");
            }
        }
    }

    /**
     * Updates modules based on the provided parameters.
     *
     * @param jahiaOnly If true, only Jahia modules will be considered.
     * @param dryRun    If true, no actual updates will be performed, just a check for available updates.
     * @param filters   List of regex patterns to filter modules by their names.
     * @return Set of module names that have updates available or have been updated.
     * @throws IOException If an error occurs during the update process.
     */

    @Override
    public UpdateModulesResult updateModules(boolean jahiaOnly, boolean dryRun, List<String> filters, boolean autostart, boolean uninstallPrevious, boolean forceUpdateAll, boolean onStartup) throws IOException {
        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            logger.warn(SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE);
            return new UpdateModulesResult(Collections.emptySet(), null);
        }
        if (!settingsBean.isProcessingServer()) {
            logger.warn("ModuleManagementCommunityService is available only on processing servers");
            return new UpdateModulesResult(Collections.emptySet(), null);
        }

        if (!dryRun && !jahiaOnly && CollectionUtils.isEmpty(filters)) {
            throw new DataFetchingException("Updating all available bundles not permitted");
        }

        // Get or refresh the list of available updates
        Set<String> updates = listAvailableUpdates(jahiaOnly, filters, false);
        if (updates.isEmpty()) {
            return new UpdateModulesResult(Collections.emptySet(), null);
        }

        if (!forceUpdateAll && (maxModulesToUpdate > 0 && updates.size() >= maxModulesToUpdate)) {
            logger.warn("Found {} modules with updates, consider reviewing the list before proceeding", updates.size());
            throw new DataFetchingException("Found " + updates.size() +
                    " modules with updates, please refine filters or run in dryRun mode");
        }

        if (logger.isInfoEnabled()) {
            logger.info("Updating modules: {}", String.join(", ", updates));
        }

        // Sort updates to have a deterministic order
        updates = updates.stream().sorted().collect(Collectors.toCollection(LinkedHashSet::new));
        StringBuilder sb = new StringBuilder();
        sb.append("- installOrUpgradeBundle:\n");
        for (String bundleKey : updates) {
            sb.append("  - url: '").append(modulesWithUpdates.get(bundleKey)).append("'\n");
            Bundle bundle = BundleUtils.getBundle(StringUtils.substringBeforeLast(bundleKey, "/"), StringUtils.substringAfterLast(bundleKey, "/").split(":")[0].trim());
            BundleStartLevel bundleStartLevel = bundle.adapt(BundleStartLevel.class);
            int moduleStartLevel = SettingsBean.getInstance().getModuleStartLevel();
            if (bundleStartLevel.getStartLevel() != moduleStartLevel) {
                sb.append("    startLevel: ").append(bundleStartLevel.getStartLevel()).append("\n");
            }
        }
        sb.append("  autoStart: ").append(autostart).append("\n");
        sb.append("  uninstallPreviousVersion: ").append(uninstallPrevious).append("\n");
        sb.append("  ignoreChecks: true").append("\n");
        sb.append("- karafCommand: \"log:log 'Bundles ").append(String.join(", ", updates)).append(" installed'\"\n");

        String yamlScript = sb.toString();
        if (!dryRun) {
            if (onStartup) {
                // Save script in SettingsBean.var path /patches on disk for running upon startup
                FileUtils.write(Path.of(settingsBean.getJahiaVarDiskPath(), "patches", "provisioning", getProvisioningFilenameWithDateAndExtension(CLUSTER_SYNCHRONIZED_YAML_SKIPPED, ".clusterSynchronized")).toFile(), yamlScript, StandardCharsets.UTF_8, false);
            } else {
                FileUtils.write(Path.of(settingsBean.getJahiaVarDiskPath(), "patches", "provisioning", getProvisioningFilenameWithDateAndExtension("module-management-community.yaml", ".yaml")).toFile(), yamlScript, StandardCharsets.UTF_8, false);
                modulesWithUpdates = null; // Clear the cache after execution
            }
        } else {
            FileUtils.write(File.createTempFile("module-management-community-temp", ".yaml", new File(settingsBean.getTmpContentDiskPath())), yamlScript, "UTF-8", true);
            logger.info("Dry run mode enabled, not executing provisioning script:\n{}", yamlScript);
        }

        return new UpdateModulesResult(updates, yamlScript);
    }

    @Nonnull
    public static String getProvisioningFilenameWithDateAndExtension(String baseName, String extension) {
        String dateStr = java.time.LocalDate.now().toString();
        return baseName.replace(extension, "-" + dateStr + extension);
    }

    /**
     * Lists available updates for modules based on the provided filters.
     *
     * @param jahiaOnly If true, only Jahia modules will be considered.
     * @param filters   List of regex patterns to filter modules by their names, if empty or null, all modules will be considered.
     * @return Set of module names that have updates available.
     * @throws IOException If an error occurs during the update check.
     */
    @Override
    public Set<String> listAvailableUpdates(boolean jahiaOnly, List<String> filters, boolean forceUpdate) throws IOException {
        List<Pattern> patterns = getPatternList(filters);
        if (!forceUpdate && (lastUpdateTime != null && Instant.now().minus(Duration.ofHours(2)).isBefore(lastUpdateTime) && modulesWithUpdates != null)) {
            logger.info("Module updates is cached until {}", lastUpdateTime.plus(Duration.ofHours(2)));
            Set<String> filteredUpdates = getFilteredUpdates(filters, patterns);
            return filteredUpdates != null ? filteredUpdates : modulesWithUpdates.keySet();
        }

        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            logger.warn(SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE);
            return Collections.emptySet();
        }
        if (!settingsBean.isProcessingServer()) {
            logger.warn("ModuleManagementCommunityService is available only on processing servers");
            return Collections.emptySet();
        }

        modulesWithUpdates = new HashMap<>();

        // Rest of the existing code to find updates
        ModuleManager moduleManager = BundleUtils.getOsgiService(ModuleManager.class, null);
        if (moduleManager == null) {
            throw new DataFetchingException("Module manager service is not available");
        }
        MavenResolver resolver = BundleUtils.getOsgiService(MavenResolver.class, null);
        if (resolver == null) {
            throw new DataFetchingException("Maven resolver service is not available");
        }

        moduleManager.getAllLocalInfos().forEach((key, bundleInfo) ->
                checkBundleUpdates(key, bundleInfo, resolver)
        );
        lastUpdateTime = Instant.now();
        Set<String> filteredUpdates = getFilteredUpdates(filters, patterns);

        Set<String> availableUpdates = filteredUpdates != null ? filteredUpdates : modulesWithUpdates.keySet();
        // If jahiaOnly is true, filter the updates to only include Jahia modules
        if (jahiaOnly) {
            availableUpdates.removeIf(update -> {
                String bundleKey = StringUtils.substringBeforeLast(update, " : ");
                Bundle bundle = BundleUtils.getBundle(StringUtils.substringBeforeLast(bundleKey, "/"), StringUtils.substringAfterLast(bundleKey, "/"));
                logger.debug("Bundle: {}", bundle);
                if (bundle != null) {
                    return !BundleUtils.isJahiaModuleBundle(bundle);
                }
                return true;
            });
        }
        return availableUpdates;
    }

    private void checkBundleUpdates(String bundleKey, BundleService.BundleInformation bundleInfo, MavenResolver resolver) {
        if (bundleInfo.getOsgiState() == BundleState.ACTIVE) {
            String key = getBundleKey(bundleKey);
            if (excludeModules.stream().anyMatch(pattern -> pattern.matcher(key).matches())) {
                logger.debug("Skipping excluded module: {}", key);
                return;
            }
            logger.debug("Checking for updates for {}", key);
            Bundle bundle = BundleUtils.getBundle(StringUtils.substringBeforeLast(key, "/"), StringUtils.substringAfterLast(key, "/"));
            logger.debug("Bundle: {}", bundle);
            if (bundle != null) {
                String location = bundle.getLocation();
                VersionScheme versionScheme = new GenericVersionScheme();
                Version bundleVersion;
                try {
                    bundleVersion = versionScheme.parseVersion(bundle.getVersion().toString());
                } catch (InvalidVersionSpecificationException e) {
                    throw new JahiaRuntimeException(e);
                }
                resolveAvailableVersions(resolver, location, bundle, bundleVersion, key);
            }
        }
    }

    private void resolveAvailableVersions(MavenResolver resolver, String location, Bundle bundle, Version bundleVersion, String key) {
        Artifact artifact = null;
        List<Version> versions = null;
        if (location.startsWith("mvn:")) {
            String[] parts = StringUtils.substringAfter(location, "mvn:").split("/");
            logger.debug("Checking for updates for {} : {} : {}", parts[0], parts[1], parts[2]);
            artifact = new DefaultArtifact(parts[0], parts[1], "jar", getVersion(bundle.getVersion()));
        } else {
            Dictionary<String, String> headers = bundle.getHeaders();
            if (headers.get("Jahia-GroupId") != null) {
                String groupId = headers.get("Jahia-GroupId");
                artifact = new DefaultArtifact(groupId, bundle.getSymbolicName(), "jar", getVersion(bundle.getVersion()));
            }
        }
        if (artifact != null) {
            versions = getVersions(bundle, resolver, artifact);
            if (!versions.isEmpty()) {
                Version latestVersion = versions.get(versions.size() - 1);
                if (!(latestVersion.toString().contains(SNAPSHOT)) && latestVersion.compareTo(bundleVersion) > 0) {
                    modulesWithUpdates.put(key + " : " + latestVersion, "mvn:" + artifact.getGroupId() + "/" + artifact.getArtifactId() + "/" + latestVersion);
                }
            }
        }
    }

    private Set<String> getFilteredUpdates(List<String> filters, List<Pattern> patterns) {
        if (CollectionUtils.isNotEmpty(filters)) {
            Set<String> filteredUpdates = new HashSet<>();
            modulesWithUpdates.keySet().stream().filter(key -> {
                String finalKey = StringUtils.substringBefore(key, " : ");
                return patterns.stream().anyMatch(pattern -> pattern.matcher(finalKey).matches());
            }).forEach(filteredUpdates::add);
            return filteredUpdates;
        }
        return null;
    }

    private static List<Pattern> getPatternList(List<String> filters) {
        if (CollectionUtils.isNotEmpty(filters) && filters.stream().anyMatch(filter -> filter.equals(".*") || filter.equals("^.*$"))) {
            throw new DataFetchingException("Updating all available bundles not permitted, please specify a valid filter");
        }

        List<Pattern> patterns = new ArrayList<>();
        if (CollectionUtils.isNotEmpty(filters)) {
            filters.forEach(f -> patterns.add(Pattern.compile(!f.endsWith("/.*") ? f + "/.*" : f)));
        }
        return patterns;
    }

    public void updateFeatures(boolean jahiaOnly, List<String> filters, MavenResolver resolver) throws IOException {
        VersionScheme versionScheme = new GenericVersionScheme();
        getFeatures(jahiaOnly, filters).forEach(feature -> {
            try {
                org.osgi.framework.Version featureVersion = new org.osgi.framework.Version(feature.getVersion());
                String featureURI = feature.getRepositoryUrl();
                // A feature repositoryURL could contain multiple features
                //First remove the protocol from the URI
                if (featureURI != null && featureURI.startsWith("mvn:")) {
                    featureURI = StringUtils.substringAfter(featureURI, "mvn:");
                }
                //Now we split by "/" to get the groupId, artifactId and version, type and classifier
                String[] parts = featureURI.split("/");
                if (parts.length < 3) {
                    logger.warn("Invalid feature repository URL: {}", featureURI);
                    return;
                }
                String groupId = parts[0];
                String artifactId = parts[1];
                String featureVersionStr = parts[2];
                String type = parts.length > 3 ? parts[3] : "xml";
                String classifier = parts.length > 4 ? parts[4] : "features";
                VersionConstraint versionConstraint = versionScheme.parseVersionConstraint(getVersion(featureVersion));
                logger.info("Checking for feature {} updates for {} : {} : {}, {}, {}", feature.getName(), groupId, artifactId, featureVersionStr, type, classifier);
                File file = resolver.resolveMetadata(groupId, artifactId, "maven-metadata.xml", null);
                if (file != null && file.exists()) {
                    checkFeatureVersions(feature, file, versionScheme, versionConstraint, featureVersionStr);
                }
            } catch (InvalidVersionSpecificationException | IOException | XmlPullParserException e) {
                throw new JahiaRuntimeException(e);
            }
        });
    }

    private void checkFeatureVersions(Feature feature, File file, VersionScheme versionScheme, VersionConstraint versionConstraint, String featureVersionStr) throws IOException, XmlPullParserException {
        List<Version> versions = new ArrayList<>();
        try (InputStream in = Files.newInputStream(file.toPath())) {
            Versioning versioning = (new MetadataXpp3Reader()).read(in, false).getVersioning();
            versioning.getVersions().stream().filter(s -> {
                try {
                    Version version = versionScheme.parseVersion(s);
                    logger.debug("Checking version: {} for feature {}", version, feature.getName());
                    if (!(version.toString().contains(SNAPSHOT))) {
                        return versionConstraint.getRange().containsVersion(version) && version.compareTo(versionScheme.parseVersion(featureVersionStr)) > 0;
                    } else {
                        logger.debug("Skipping SNAPSHOT version: {}", version);
                        return false;
                    }
                } catch (InvalidVersionSpecificationException e) {
                    throw new DataFetchingException(e);
                }
            }).forEach(version -> {
                try {
                    versions.add(versionScheme.parseVersion(version));
                } catch (InvalidVersionSpecificationException e) {
                    throw new JahiaRuntimeException(e);
                }
            });
            logger.info("Found {} versions", versions.size());
            if (logger.isInfoEnabled()) {
                versions.forEach(version ->
                        logger.info("Version : {}", version)
                );
            }
        }
    }

    @Override
    public List<Feature> getFeatures(boolean jahiaOnly, List<String> filters) throws IOException {
        try {
            Feature[] features = featuresService.listInstalledFeatures();
            return Arrays.asList(features);
        } catch (Exception e) {
            throw new DataFetchingException("Error retrieving installed features", e);
        }
    }

    @Override
    public Set<String> getInstalledModules() throws IOException {
        SortedSet<String> installedModules = new TreeSet<>();
        for (Bundle bundle : FrameworkService.getBundleContext().getBundles()) {
            String symbolicName = bundle.getSymbolicName();
            installedModules.add(symbolicName + "/" + bundle.getVersion().toString() + ":" + bundle.getState());
        }
        return installedModules;
    }

    @Override
    public Instant getLastUpdateTime() {
        return lastUpdateTime;
    }

    @Override
    public Bundle getBundleById(long bundleId) {
        return bundleContext.getBundle(bundleId);
    }

    @Override
    public Map<String, Boolean> getSitesDeployment(Bundle bundle) throws RepositoryException {
        return jcrTemplate.doExecuteWithSystemSessionAsUser(jahiaUserManagerService.lookupRootUser().getJahiaUser(), Constants.EDIT_WORKSPACE, Locale.getDefault(), session -> {
            try {
                String query = "select * from [jnt:virtualsite] as sites WHERE ISDESCENDANTNODE(sites, '/sites')";
                QueryResultWrapper resultWrapper = session.getWorkspace().getQueryManager().createQuery(query, Query.JCR_SQL2).execute();
                JCRNodeIteratorWrapper nodes = resultWrapper.getNodes();
                if (nodes.hasNext()) {
                    Map<String, Boolean> sites = new HashMap<>();
                    nodes.forEachRemaining(node -> {
                        JahiaSite site = (JCRSiteNode) node;
                        if (site != null) {
                            sites.put(site.getSiteKey(), site.getInstalledModules().contains(bundle.getSymbolicName()));
                        }
                    });
                    return sites;
                }
            } catch (Exception e) {
                logger.error("Error retrieving sites deployment for bundle {}", bundle.getSymbolicName(), e);
            }
            return Map.of();
        });
    }

    public boolean enableModuleOnSites(Bundle bundle, Set<String> sites) {
        if (bundle == null || sites == null || sites.isEmpty()) {
            logger.warn("Bundle or sites are null or empty, cannot enable module on sites");
            return false;
        }
        // Generate a provisioning script to enable the module on the specified sites
        //# Enable jExperience on digitall,luxe
        //- enable: "jexperience"
        //  site: ["digitall", "luxe"]
        //- karafCommand: "log:log 'jExperience enabled on digitall and luxe'"
        String yamlScript = "- enable: \"" + bundle.getSymbolicName() + "\"\n" +
                "  site: [" +
                sites.stream().map(site -> "\"" + site + "\"").collect(Collectors.joining(", ")) +
                "]\n" +
                "- karafCommand: \"log:log '" + bundle.getSymbolicName() + " enabled on " + String.join(", ", sites) + "'\"\n";
        try {
            provisioningManager.executeScript(yamlScript, "yaml");
            logger.info("Module {} enabled on sites {}", bundle.getSymbolicName(), String.join(", ", sites));
            return true;
        } catch (Exception e) {
            logger.error("Error enabling module {} on sites {}", bundle.getSymbolicName(), String.join(", ", sites), e);
            return false;
        }
    }

    public boolean disableModuleOnSites(Bundle bundle, Set<String> sites) {
        if (bundle == null || sites == null || sites.isEmpty()) {
            logger.warn("Bundle or sites are null or empty, cannot disable module on sites");
            return false;
        }
        // Call jahia site service to uninstall the module from the specified sites
        try {
            jcrTemplate.doExecuteWithSystemSessionAsUser(jahiaUserManagerService.lookupRootUser().getJahiaUser(), Constants.EDIT_WORKSPACE, Locale.getDefault(), session -> {
                try {
                    for (String siteKey : sites) {
                        JahiaSite site = jahiaSitesService.getSiteByKey(siteKey, session);
                        if (site != null) {
                            JahiaTemplatesPackage templatePackage = jahiaTemplateManagerService.getTemplatePackageById(bundle.getSymbolicName());
                            if (templatePackage != null) {
                                jahiaTemplateManagerService.uninstallModule(templatePackage, site.getJCRLocalPath(), session);
                                logger.info("Module {} disabled on site {}", bundle.getSymbolicName(), siteKey);
                            } else {
                                logger.warn("Module {} not found for site {}", bundle.getSymbolicName(), siteKey);
                            }
                        } else {
                            logger.warn("Site {} not found", siteKey);
                        }
                    }
                    session.save();
                } catch (RepositoryException e) {
                    logger.error("Error disabling module {} on sites {}", bundle.getSymbolicName(), String.join(", ", sites), e);
                }
                return null;
            });
        } catch (RepositoryException e) {
            logger.error("Error disabling module {} on sites {}", bundle.getSymbolicName(), String.join(", ", sites), e);
            return false;
        }
        logger.info("Module {} disabled on sites {}", bundle.getSymbolicName(), String.join(", ", sites));
        return true;
    }

    @Override
    public boolean importModule(Bundle bundle, boolean force) {
        if (bundle == null) {
            logger.warn("Bundle is null, cannot reimport");
            return false;
        }
        JahiaTemplatesPackage templatePackage = jahiaTemplateManagerService.getTemplatePackageById(bundle.getSymbolicName());
        if (templatePackage == null) {
            logger.warn("Template package not found for bundle {}", bundle.getBundleId());
            return false;
        }
        if (!force && checkImported(templatePackage)) {
            logger.info("Module {} is already imported, skipping reimport", templatePackage.getId());
            return true;
        }
        scanForImportFiles(bundle, templatePackage);

        if (SettingsBean.getInstance().isProcessingServer()) {
            try {
                logger.info("--- Deploying content for DX OSGi bundle {} v{} --", templatePackage.getId(), templatePackage.getVersion());
                JahiaUser user = JCRSessionFactory.getInstance().getCurrentUser() != null ? JCRSessionFactory.getInstance().getCurrentUser() : jahiaUserManagerService.lookupRootUser().getJahiaUser();

                JCRTemplate.getInstance().doExecuteWithSystemSessionAsUser(user, null, null, session -> {
                    jahiaTemplateManagerService.getTemplatePackageDeployer().initializeModuleContent(templatePackage, session);
                    return null;
                });
                logger.info("--- Done deploying content for DX OSGi bundle {} v{} --", templatePackage.getId(), templatePackage.getVersion());
                return true;
            } catch (RepositoryException e) {
                logger.error("Error while initializing module content for module " + templatePackage, e);
            }
        }
        return false;
    }

    @Override
    public List<Map<String, Object>> getBundleVersionsFromJcr(Bundle bundle) throws RepositoryException {
        String groupId = bundle.getHeaders().get("Jahia-GroupId");
        if (groupId == null) {
            logger.debug("No Jahia-GroupId header for bundle {}, skipping JCR version lookup", bundle.getSymbolicName());
            return Collections.emptyList();
        }
        String groupPath = groupId.replace('.', '/');
        String jcrBundlePath = "/module-management/bundles/" + groupPath + "/" + bundle.getSymbolicName();

        return jcrTemplate.doExecuteWithSystemSessionAsUser(
                jahiaUserManagerService.lookupRootUser().getJahiaUser(),
                Constants.EDIT_WORKSPACE, null,
                session -> {
                    if (!session.itemExists(jcrBundlePath)) {
                        return Collections.emptyList();
                    }
                    javax.jcr.Node bundleFolder = session.getNode(jcrBundlePath);
                    javax.jcr.NodeIterator versionFolders = bundleFolder.getNodes();
                    List<Map<String, Object>> versions = new ArrayList<>();
                    while (versionFolders.hasNext()) {
                        javax.jcr.Node versionFolder = versionFolders.nextNode();
                        if (versionFolder.isNodeType("jnt:moduleManagementBundleFolder")) {
                            javax.jcr.NodeIterator jarNodes = versionFolder.getNodes();
                            while (jarNodes.hasNext()) {
                                javax.jcr.Node jarNode = jarNodes.nextNode();
                                if (jarNode.isNodeType("jnt:moduleManagementBundle")) {
                                    Map<String, Object> info = new HashMap<>();
                                    info.put("version", versionFolder.getName());
                                    info.put("jcrPath", jarNode.getPath());
                                    info.put("fileName", jarNode.getName());
                                    try {
                                        if (jarNode.hasNode("jcr:content")) {
                                            javax.jcr.Node content = jarNode.getNode("jcr:content");
                                            if (content.hasProperty("jcr:data")) {
                                                javax.jcr.Binary bin = content.getProperty("jcr:data").getBinary();
                                                info.put("size", bin.getSize());
                                                bin.dispose();
                                            }
                                            if (content.hasProperty("jcr:lastModified")) {
                                                info.put("lastModified", content.getProperty("jcr:lastModified").getDate().toInstant().toString());
                                            }
                                        }
                                    } catch (Exception e) {
                                        logger.warn("Error reading metadata for {} version {}", bundle.getSymbolicName(), versionFolder.getName(), e);
                                    }
                                    versions.add(info);
                                }
                            }
                        }
                    }
                    versions.sort((a, b) -> {
                        String vA = (String) a.get("version");
                        String vB = (String) b.get("version");
                        try {
                            VersionScheme vs = new GenericVersionScheme();
                            return vs.parseVersion(vB).compareTo(vs.parseVersion(vA));
                        } catch (Exception e) {
                            return vB.compareTo(vA);
                        }
                    });

                    // Collect all OSGi-installed versions of this bundle (any state)
                    Set<String> installedVersions = Arrays.stream(bundleContext.getBundles())
                            .filter(b -> bundle.getSymbolicName().equals(b.getSymbolicName()))
                            .map(b -> b.getVersion().toString())
                            .collect(Collectors.toSet());

                    // Remove versions that are already present in OSGi
                    versions.removeIf(v -> installedVersions.contains(v.get("version")));

                    return versions;
                });
    }

    @Override
    public String installBundleVersionFromJcr(String jcrPath) throws IOException {
        // Derive symbolicName and targetVersion from the JCR path structure:
        // /module-management/bundles/{group/path}/{symbolicName}/{version}/{file.jar}
        String[] parts = jcrPath.split("/");
        if (parts.length < 3) {
            throw new IOException("Cannot derive bundle coordinates from JCR path: " + jcrPath);
        }
        final String symbolicName = parts[parts.length - 3];
        final String targetVersion = parts[parts.length - 2];

        // Snapshot all currently installed versions of this symbolic name BEFORE installing
        // so we know exactly which ones to remove afterward
        List<Bundle> existingVersions = Arrays.stream(bundleContext.getBundles())
                .filter(b -> symbolicName.equals(b.getSymbolicName()))
                .collect(Collectors.toList());
        logger.info("Found {} existing OSGi bundle(s) for {} before restore: {}",
                existingVersions.size(), symbolicName,
                existingVersions.stream().map(b -> b.getVersion().toString()).collect(Collectors.joining(", ")));
        SettingsBean settingsBean = SettingsBean.getInstance();
        // Create the temp file first, outside the JCR session, so it survives past the session close
        File tempFile = File.createTempFile("bundle-rollback-", ".jar", new File(settingsBean.getTmpContentDiskPath()));
        final String[] fileNameHolder = {null};

        try {
            // Stream JCR binary directly to disk — never holds the full JAR in memory
            jcrTemplate.doExecuteWithSystemSessionAsUser(
                    jahiaUserManagerService.lookupRootUser().getJahiaUser(),
                    Constants.EDIT_WORKSPACE, null,
                    session -> {
                        javax.jcr.Node jarNode = session.getNode(jcrPath);
                        fileNameHolder[0] = jarNode.getName();
                        javax.jcr.Node content = jarNode.getNode("jcr:content");
                        javax.jcr.Binary binary = content.getProperty("jcr:data").getBinary();
                        try (java.io.InputStream in = new java.io.BufferedInputStream(binary.getStream(), 64 * 1024);
                             java.io.OutputStream out = new java.io.BufferedOutputStream(new java.io.FileOutputStream(tempFile), 64 * 1024)) {
                            org.apache.commons.io.IOUtils.copy(in, out);
                        } catch (IOException e) {
                            throw new RepositoryException("Error streaming JAR binary to disk", e);
                        } finally {
                            binary.dispose();
                        }
                        return null;
                    });
        } catch (RepositoryException e) {
            FileUtils.deleteQuietly(tempFile);
            throw new IOException("Error reading bundle from JCR path: " + jcrPath, e);
        }

        String fileName = fileNameHolder[0];
        try {
            String yamlScript = "- installBundle:\n" +
                    "  - url: '" + tempFile.toURI() + "'\n" +
                    "  autoStart: true\n" +
                    "  uninstallPreviousVersion: true\n" +
                    "  ignoreChecks: true\n" +
                    "- karafCommand: \"log:log 'Bundle " + fileName + " installed from JCR rollback'\"\n";
            provisioningManager.executeScript(yamlScript, "yaml");
            logger.info("Bundle {} installed from JCR path: {}", fileName, jcrPath);
        } finally {
            FileUtils.deleteQuietly(tempFile);
        }

        // Wait up to 30 s for the restored version to be visible in OSGi
        Bundle restoredBundle = null;
        long deadline = System.currentTimeMillis() + 30_000L;
        while (System.currentTimeMillis() < deadline) {
            restoredBundle = Arrays.stream(bundleContext.getBundles())
                    .filter(b -> symbolicName.equals(b.getSymbolicName())
                            && targetVersion.equals(b.getVersion().toString()))
                    .findFirst().orElse(null);
            if (restoredBundle != null) {
                break;
            }
            try {
                Thread.sleep(500);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }

        if (restoredBundle == null) {
            logger.warn("Restored bundle {} v{} did not appear in OSGi within 30 s — skipping old-version cleanup",
                    symbolicName, targetVersion);
            return "Bundle " + fileName + " installed but could not confirm in OSGi — other versions were NOT removed";
        }

        // Uninstall all previously existing versions (other than the one we just restored)
        ModuleManager moduleManager = BundleUtils.getOsgiService(ModuleManager.class, null);
        List<String> uninstalled = new ArrayList<>();
        if (moduleManager != null) {
            for (Bundle old : existingVersions) {
                if (!targetVersion.equals(old.getVersion().toString())) {
                    try {
                        moduleManager.uninstall(BundleInfo.fromBundle(old).getKey(), null);
                        uninstalled.add(old.getVersion().toString());
                        logger.info("Uninstalled old version {} of {}", old.getVersion(), symbolicName);
                    } catch (Exception e) {
                        logger.warn("Could not uninstall version {} of {}: {}", old.getVersion(), symbolicName, e.getMessage());
                    }
                }
            }
        }

        String result = "Bundle " + fileName + " (v" + targetVersion + ") installed successfully";
        if (!uninstalled.isEmpty()) {
            result += ". Removed old version(s): " + String.join(", ", uninstalled);
        }
        return result;
    }

    @Override
    public String deployUploadedModule(InputStream fileStream, String fileName) throws IOException {
        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            throw new IOException(SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE);
        }
        if (!settingsBean.isProcessingServer()) {
            throw new IOException("Module deployment is only available on processing servers");
        }

        File tempFile = File.createTempFile("module-upload-", ".jar", new File(settingsBean.getTmpContentDiskPath()));
        try {
            FileUtils.copyInputStreamToFile(fileStream, tempFile);
            validateOsgiBundle(tempFile, fileName);

            String yamlScript = "- installOrUpgradeBundle:\n" +
                    "  - url: '" + tempFile.toURI() + "'\n" +
                    "  autoStart: true\n" +
                    "  uninstallPreviousVersion: true\n" +
                    "  ignoreChecks: false\n" +
                    "- karafCommand: \"log:log 'Module " + fileName.replace("'", "\\'") + " deployed via upload'\"\n";

            provisioningManager.executeScript(yamlScript, "yaml");
            logger.info("Module {} deployed successfully via upload", fileName);
            return "Module " + fileName + " deployed successfully";
        } finally {
            FileUtils.deleteQuietly(tempFile);
        }
    }

    // -------------------------------------------------------------------------
    // Export / Import
    // -------------------------------------------------------------------------

    @Override
    public String previewExportYaml(ExportOptions options) throws IOException {
        List<Bundle> bundles = collectExportBundles(options);
        // null embeddedJars = preview mode: every bundle shows as ${archiveRoot}/... or mvn: depending on embedAll
        return buildExportYamlString(bundles, null, options.isEmbedAll());
    }

    @Override
    public File exportModulesArchive(ExportOptions options) throws IOException {
        checkExportAvailability();
        List<Bundle> bundles = collectExportBundles(options);
        boolean embedAll = options.isEmbedAll();

        Map<String, File> embeddedJars = new LinkedHashMap<>();
        Map<String, String> mavenFallbacks = new LinkedHashMap<>();
        // Track temp files created from JCR so we can delete them after the ZIP is assembled
        List<File> jcrTempFiles = new ArrayList<>();

        try {
            for (Bundle bundle : bundles) {
                String entryName = "bundles/" + bundle.getSymbolicName() + "-" + bundle.getVersion() + ".jar";
                String mavenUrl = resolveMavenUrl(bundle);

                if (embedAll || mavenUrl == null) {
                    // Primary: read the JAR from the JCR module-management store
                    File jar = resolveJarFromJcr(bundle);
                    if (jar != null) {
                        jcrTempFiles.add(jar); // owned by us — delete after ZIP is built
                        embeddedJars.put(entryName, jar);
                    } else {
                        // Secondary fallback: bundle loaded directly from a file: location
                        jar = resolveJarFromDisk(bundle);
                        if (jar != null) {
                            embeddedJars.put(entryName, jar); // not owned — do not delete
                        } else if (mavenUrl != null) {
                            logger.warn("Bundle {}/{}: JAR not in JCR or disk, falling back to Maven URL",
                                    bundle.getSymbolicName(), bundle.getVersion());
                            mavenFallbacks.put(entryName, mavenUrl);
                        } else {
                            logger.warn("Skipping bundle {}/{}: JAR cannot be resolved and no Maven URL available",
                                    bundle.getSymbolicName(), bundle.getVersion());
                        }
                    }
                }
                // else: embedAll=false and mavenUrl != null → emitted as mvn: URL in YAML
            }

            String yaml = buildExportYamlString(bundles, embeddedJars, embedAll, mavenFallbacks);

            SettingsBean settingsBean = SettingsBean.getInstance();
            File zipFile = File.createTempFile("module-export-", ".zip",
                    new File(settingsBean.getTmpContentDiskPath()));

            try (ZipOutputStream zos = new ZipOutputStream(
                    new BufferedOutputStream(new FileOutputStream(zipFile), 65536))) {

                for (Map.Entry<String, File> entry : embeddedJars.entrySet()) {
                    addFileToZip(zos, entry.getValue(), entry.getKey());
                }

                byte[] yamlBytes = yaml.getBytes(StandardCharsets.UTF_8);
                zos.putNextEntry(new ZipEntry("provisioning.yaml"));
                zos.write(yamlBytes);
                zos.closeEntry();
            }

            logger.info("Module export archive created: {} bundles ({} embedded from JCR, {} Maven-referenced, {} mvn-fallback)",
                    bundles.size(), embeddedJars.size(),
                    bundles.size() - embeddedJars.size() - mavenFallbacks.size(),
                    mavenFallbacks.size());
            return zipFile;

        } finally {
            // Clean up temp files that were streamed out of JCR
            jcrTempFiles.forEach(FileUtils::deleteQuietly);
        }
    }

    @Override
    public String importModuleArchive(InputStream zipStream, String archiveName) throws IOException {
        checkExportAvailability();

        SettingsBean settingsBean = SettingsBean.getInstance();
        File extractDir = new File(settingsBean.getTmpContentDiskPath(),
                "module-import-" + UUID.randomUUID());
        if (!extractDir.mkdirs()) {
            throw new IOException("Cannot create temp extraction directory: " + extractDir);
        }

        try {
            int jarCount = extractModuleArchive(zipStream, extractDir);

            File yamlFile = new File(extractDir, "provisioning.yaml");
            if (!yamlFile.exists()) {
                throw new IOException("Archive '" + archiveName + "' does not contain provisioning.yaml");
            }

            String rawYaml = FileUtils.readFileToString(yamlFile, StandardCharsets.UTF_8);
            // Replace "${archiveRoot}/" (including the slash) with the file:// URI of the
            // extraction directory.  File.toURI() for a directory always ends with "/",
            // so "file:///tmp/module-import-uuid/" replaces "${archiveRoot}/" giving
            // "file:///tmp/module-import-uuid/bundles/foo.jar" — the format the
            // provisioning manager expects for local file URLs.
            String extractDirUri = extractDir.toURI().toString(); // e.g. "file:///tmp/module-import-uuid/"
            String resolvedYaml = rawYaml.replace("${archiveRoot}/", extractDirUri);

            provisioningManager.executeScript(resolvedYaml, "yaml");
            logger.info("Module archive '{}' imported successfully ({} JARs extracted)", archiveName, jarCount);
            return "Archive '" + archiveName + "' imported successfully (" + jarCount + " embedded bundle(s) deployed)";
        } finally {
            FileUtils.deleteQuietly(extractDir);
        }
    }

    // -- helpers --

    private void checkExportAvailability() throws IOException {
        SettingsBean sb = SettingsBean.getInstance();
        if (sb.isMaintenanceMode() || sb.isReadOnlyMode() || sb.isFullReadOnlyMode()) {
            throw new IOException(SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE);
        }
        if (!sb.isProcessingServer()) {
            throw new IOException("Module export/import is only available on processing servers");
        }
    }

    private List<Bundle> collectExportBundles(ExportOptions options) {
        return Arrays.stream(bundleContext.getBundles())
                .filter(b -> b.getState() == Bundle.ACTIVE || b.getState() == Bundle.RESOLVED)
                .filter(b -> {
                    String type = b.getHeaders().get("Jahia-Module-Type");
                    return type != null && options.getTypes().contains(type);
                })
                .sorted(Comparator.comparing(Bundle::getSymbolicName))
                .collect(Collectors.toList());
    }

    /**
     * Build the provisioning YAML string.
     *
     * @param bundles        ordered list of bundles to export
     * @param embeddedJars   zipEntryName → localFile; {@code null} = preview mode (every bundle shown as archiveRoot/mvn: depending on embedAll)
     * @param embedAll       when true, emit ${archiveRoot} URLs; when false, emit mvn: URLs for Maven bundles
     * @param mavenFallbacks zipEntryName → mvn: URL for bundles where embedAll=true but JAR could not be resolved
     */
    private String buildExportYamlString(List<Bundle> bundles, Map<String, File> embeddedJars,
                                          boolean embedAll, Map<String, String> mavenFallbacks) {
        int defaultStartLevel = SettingsBean.getInstance().getModuleStartLevel();
        StringBuilder sb = new StringBuilder();
        sb.append("# Generated by Module Management Community\n");
        sb.append("# Date: ").append(java.time.LocalDate.now()).append("\n");
        sb.append("# Eligible bundles: ").append(bundles.size()).append("\n");
        sb.append("# Embed mode: ").append(embedAll ? "all JARs embedded" : "Maven URLs + embedded non-Maven").append("\n\n");
        sb.append("- installOrUpgradeBundle:\n");

        int included = 0;
        for (Bundle bundle : bundles) {
            String entryName = "bundles/" + bundle.getSymbolicName() + "-" + bundle.getVersion() + ".jar";
            String mavenUrl = resolveMavenUrl(bundle);
            int sl = getBundleStartLevel(bundle);

            if (!embedAll && mavenUrl != null) {
                // Maven-only mode: emit mvn: URL directly
                sb.append("  - url: '").append(mavenUrl).append("'\n");
                if (sl != defaultStartLevel) {
                    sb.append("    startLevel: ").append(sl).append("\n");
                }
                included++;
            } else {
                // Embed mode (or non-Maven bundle)
                boolean isEmbedded = (embeddedJars == null) || embeddedJars.containsKey(entryName);
                if (isEmbedded) {
                    sb.append("  - url: '${archiveRoot}/").append(entryName).append("'\n");
                    if (sl != defaultStartLevel) {
                        sb.append("    startLevel: ").append(sl).append("\n");
                    }
                    included++;
                } else if (mavenFallbacks != null && mavenFallbacks.containsKey(entryName)) {
                    // JAR not in local cache — fall back to mvn: URL with a comment
                    sb.append("  - url: '").append(mavenFallbacks.get(entryName)).append("' # JAR not found locally\n");
                    if (sl != defaultStartLevel) {
                        sb.append("    startLevel: ").append(sl).append("\n");
                    }
                    included++;
                }
                // else: skipped — already warned during first pass
            }
        }

        sb.append("  autoStart: true\n");
        sb.append("  uninstallPreviousVersion: true\n");
        sb.append("  ignoreChecks: false\n");
        sb.append("- karafCommand: \"log:log 'Module snapshot imported - ")
                .append(included).append(" bundles'\"\n");
        return sb.toString();
    }

    /** Preview / simple overload — no fallbacks map needed. */
    private String buildExportYamlString(List<Bundle> bundles, Map<String, File> embeddedJars, boolean embedAll) {
        return buildExportYamlString(bundles, embeddedJars, embedAll, Collections.emptyMap());
    }

    /**
     * Return the {@code mvn:} URL for a bundle (used in non-embedAll mode), or {@code null}.
     */
    private String resolveMavenUrl(Bundle bundle) {
        String location = bundle.getLocation();
        if (location != null && location.startsWith("mvn:")) {
            return location;
        }
        String groupId = bundle.getHeaders().get("Jahia-GroupId");
        if (groupId != null) {
            return "mvn:" + groupId + "/" + bundle.getSymbolicName() + "/" + bundle.getVersion();
        }
        return null;
    }

    /**
     * Resolve the JAR for {@code bundle} by reading it from the JCR module management store
     * ({@code /module-management/bundles/{groupPath}/{symbolicName}/{version}/...}),
     * following the same approach as {@link #installBundleVersionFromJcr}.
     *
     * <p>The binary is streamed to a <em>temporary</em> file. The caller is responsible
     * for deleting that file after use (via {@code FileUtils.deleteQuietly}).
     *
     * @return a populated temp file, or {@code null} if the bundle is not in JCR
     */
    private File resolveJarFromJcr(Bundle bundle) {
        String groupId = bundle.getHeaders().get("Jahia-GroupId");
        if (groupId == null) {
            return null;
        }

        String groupPath = groupId.replace('.', '/');
        String version = bundle.getVersion().toString();
        String jcrVersionPath = "/module-management/bundles/" + groupPath
                + "/" + bundle.getSymbolicName() + "/" + version;

        SettingsBean settingsBean = SettingsBean.getInstance();
        File tempFile = null;
        try {
            tempFile = File.createTempFile("bundle-export-", ".jar",
                    new File(settingsBean.getTmpContentDiskPath()));
            final File out = tempFile;

            boolean found = jcrTemplate.doExecuteWithSystemSessionAsUser(
                    jahiaUserManagerService.lookupRootUser().getJahiaUser(),
                    Constants.EDIT_WORKSPACE, null,
                    session -> {
                        if (!session.itemExists(jcrVersionPath)) {
                            logger.debug("JCR path not found for bundle {}/{}: {}",
                                    bundle.getSymbolicName(), version, jcrVersionPath);
                            return false;
                        }
                        javax.jcr.Node versionFolder = session.getNode(jcrVersionPath);
                        javax.jcr.NodeIterator it = versionFolder.getNodes();
                        while (it.hasNext()) {
                            javax.jcr.Node jarNode = it.nextNode();
                            if (jarNode.isNodeType("jnt:moduleManagementBundle")) {
                                javax.jcr.Node content = jarNode.getNode("jcr:content");
                                javax.jcr.Binary binary = content.getProperty("jcr:data").getBinary();
                                try (java.io.InputStream in = new java.io.BufferedInputStream(binary.getStream(), 65536);
                                     java.io.OutputStream os = new java.io.BufferedOutputStream(new java.io.FileOutputStream(out), 65536)) {
                                    org.apache.commons.io.IOUtils.copy(in, os);
                                } catch (IOException e) {
                                    throw new RepositoryException("Error streaming JAR from JCR", e);
                                } finally {
                                    binary.dispose();
                                }
                                logger.debug("Resolved JAR from JCR for bundle {}/{} ({})",
                                        bundle.getSymbolicName(), version, jarNode.getPath());
                                return true;
                            }
                        }
                        return false;
                    });

            if (found && tempFile.length() > 0) {
                return tempFile;
            }
        } catch (Exception e) {
            logger.debug("JCR JAR resolution failed for bundle {}/{}: {}",
                    bundle.getSymbolicName(), bundle.getVersion(), e.getMessage());
        }

        FileUtils.deleteQuietly(tempFile);
        return null;
    }

    /**
     * Fallback: return the JAR {@link File} directly from a {@code file:} location
     * (e.g. a bundle that was loaded from disk without going through the JCR store).
     * Returns {@code null} if the location is not a {@code file:} URI or the file does not exist.
     */
    private File resolveJarFromDisk(Bundle bundle) {
        String location = bundle.getLocation();
        if (location != null && location.startsWith("file:")) {
            try {
                File f = new File(new URI(location));
                if (f.exists() && f.isFile()) {
                    return f;
                }
            } catch (Exception e) {
                logger.debug("Cannot parse file URI {} for bundle {}", location, bundle.getSymbolicName());
            }
        }
        return null;
    }

    /** @deprecated kept for backward compatibility — use {@link #resolveJarFromJcr}/{@link #resolveJarFromDisk} */
    private File resolveAnyJarFile(Bundle bundle, MavenResolver resolver) {
        File jar = resolveJarFromJcr(bundle);
        return jar != null ? jar : resolveJarFromDisk(bundle);
    }

    /** @deprecated use {@link #resolveAnyJarFile} */
    private File resolveJarFileForEmbed(Bundle bundle, MavenResolver resolver) {
        return resolveAnyJarFile(bundle, resolver);
    }

    private int getBundleStartLevel(Bundle bundle) {
        BundleStartLevel bsl = bundle.adapt(BundleStartLevel.class);
        return bsl != null ? bsl.getStartLevel() : SettingsBean.getInstance().getModuleStartLevel();
    }

    private void addFileToZip(ZipOutputStream zos, File file, String entryName) throws IOException {
        zos.putNextEntry(new ZipEntry(entryName));
        try (BufferedInputStream bis = new BufferedInputStream(new FileInputStream(file), 65536)) {
            byte[] buf = new byte[65536];
            int len;
            while ((len = bis.read(buf)) > 0) {
                zos.write(buf, 0, len);
            }
        }
        zos.closeEntry();
    }

    /**
     * Extract entries from a ZIP stream into {@code targetDir}.
     * Only {@code .jar} and {@code .yaml}/{@code .yml} entries are extracted.
     * Directory-traversal entries are rejected.
     *
     * @return the number of JAR entries extracted
     */
    private int extractModuleArchive(InputStream zipStream, File targetDir) throws IOException {
        int jarCount = 0;
        try (ZipInputStream zis = new ZipInputStream(new BufferedInputStream(zipStream))) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName().replace('\\', '/');
                // Security: no path traversal
                if (name.contains("..") || name.startsWith("/")) {
                    logger.warn("Rejecting potentially dangerous ZIP entry: {}", name);
                    zis.closeEntry();
                    continue;
                }
                // Accept only expected file types
                if (!name.endsWith(".jar") && !name.endsWith(".yaml") && !name.endsWith(".yml")) {
                    zis.closeEntry();
                    continue;
                }
                File outFile = new File(targetDir, name);
                // Double-check the canonical path is still under targetDir
                if (!outFile.getCanonicalPath().startsWith(targetDir.getCanonicalPath() + File.separator)) {
                    logger.warn("Rejecting ZIP entry with escape path: {}", name);
                    zis.closeEntry();
                    continue;
                }
                outFile.getParentFile().mkdirs();
                try (BufferedOutputStream bos = new BufferedOutputStream(new FileOutputStream(outFile), 65536)) {
                    byte[] buf = new byte[65536];
                    int len;
                    while ((len = zis.read(buf)) > 0) {
                        bos.write(buf, 0, len);
                    }
                }
                if (name.endsWith(".jar")) {
                    jarCount++;
                }
                zis.closeEntry();
            }
        }
        return jarCount;
    }

    private void validateOsgiBundle(File jarFile, String fileName) throws IOException {
        if (!fileName.toLowerCase().endsWith(".jar")) {
            throw new IOException("Only .jar files are accepted");
        }
        try (java.util.jar.JarFile jar = new java.util.jar.JarFile(jarFile)) {
            java.util.jar.Manifest manifest = jar.getManifest();
            if (manifest == null) {
                throw new IOException("Invalid JAR: missing MANIFEST.MF");
            }
            if (manifest.getMainAttributes().getValue("Bundle-SymbolicName") == null) {
                throw new IOException("File is not a valid OSGi bundle: missing Bundle-SymbolicName in MANIFEST.MF");
            }
        } catch (java.util.zip.ZipException e) {
            throw new IOException("File is not a valid JAR archive: " + e.getMessage(), e);
        }
    }

    // -------------------------------------------------------------------------
    // JCR version cleanup
    // -------------------------------------------------------------------------

    @Override
    public String cleanupJcrVersions() throws RepositoryException {
        final String BASE_PATH = "/module-management/bundles";

        // Collect all currently OSGi-installed versions, keyed by symbolic name
        final Map<String, Set<String>> osgiVersions = new HashMap<>();
        for (Bundle b : bundleContext.getBundles()) {
            osgiVersions.computeIfAbsent(b.getSymbolicName(), k -> new HashSet<>())
                        .add(b.getVersion().toString());
        }

        final int[] removed = {0};
        final long[] freedBytes = {0};

        jcrTemplate.doExecuteWithSystemSessionAsUser(
                jahiaUserManagerService.lookupRootUser().getJahiaUser(),
                Constants.EDIT_WORKSPACE, null,
                session -> {
                    if (!session.itemExists(BASE_PATH)) {
                        logger.info("JCR cleanup: base path {} not found, nothing to do", BASE_PATH);
                        return null;
                    }

                    // Walk the tree and collect: moduleFolderPath → list of version-folder nodes
                    Map<String, List<javax.jcr.Node>> versionsByModule = new LinkedHashMap<>();
                    collectVersionFolders(session.getNode(BASE_PATH), versionsByModule);

                    VersionScheme vs = new GenericVersionScheme();

                    for (Map.Entry<String, List<javax.jcr.Node>> entry : versionsByModule.entrySet()) {
                        List<javax.jcr.Node> versionFolders = entry.getValue();
                        if (versionFolders.size() <= 1) {
                            continue; // Nothing to clean up for this module
                        }

                        // Derive the symbolic name from the module folder path
                        String moduleFolderPath = entry.getKey();
                        String symbolicName = moduleFolderPath.substring(moduleFolderPath.lastIndexOf('/') + 1);

                        // Sort descending (newest version first)
                        List<javax.jcr.Node> sorted = new ArrayList<>(versionFolders);
                        sorted.sort((a, b) -> {
                            try {
                                return vs.parseVersion(b.getName()).compareTo(vs.parseVersion(a.getName()));
                            } catch (Exception e) {
                                try {
                                    return b.getName().compareTo(a.getName());
                                } catch (Exception ex) {
                                    return 0;
                                }
                            }
                        });

                        // Determine which version names to retain
                        Set<String> keep = new LinkedHashSet<>();
                        // 1) Always keep every version that is currently in OSGi
                        keep.addAll(osgiVersions.getOrDefault(symbolicName, Collections.emptySet()));
                        // 2) Keep the most-recent JCR version
                        if (!sorted.isEmpty()) {
                            try { keep.add(sorted.get(0).getName()); } catch (RepositoryException ignored) {}
                        }
                        // 3) Keep one additional "previous" version
                        for (javax.jcr.Node vf : sorted) {
                            if (keep.size() >= 2) break;
                            try { keep.add(vf.getName()); } catch (RepositoryException ignored) {}
                        }

                        // Remove everything not in the keep set
                        for (javax.jcr.Node vf : versionFolders) {
                            try {
                                String versionName = vf.getName();
                                if (!keep.contains(versionName)) {
                                    freedBytes[0] += computeVersionFolderSize(vf);
                                    vf.remove();
                                    removed[0]++;
                                    logger.info("JCR cleanup: removed {} v{}", symbolicName, versionName);
                                }
                            } catch (RepositoryException ex) {
                                try {
                                    logger.warn("JCR cleanup: could not remove a version of {}: {}", symbolicName, ex.getMessage());
                                } catch (Exception ignored) {}
                            }
                        }
                    }

                    session.save();
                    return null;
                });

        String summary = String.format(
                "JCR version cleanup complete: removed %d version folder(s), freed approximately %.1f MB",
                removed[0], freedBytes[0] / (1024.0 * 1024.0));
        logger.info(summary);
        return summary;
    }

    /**
     * @see ModuleManagementCommunityService#generateProvisioningScript(List)
     */
    @Override
    public String generateProvisioningScript(List<String> symbolicNames) {
        if (symbolicNames == null || symbolicNames.isEmpty()) {
            return "# No modules selected\n";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("- installOrUpgradeBundle:\n");
        List<String> included = new ArrayList<>();
        List<String> skipped = new ArrayList<>();

        for (String symbolicName : symbolicNames) {
            // Find the currently active bundle by symbolic name (version-agnostic lookup)
            Bundle bundle = null;
            for (Bundle b : bundleContext.getBundles()) {
                if (symbolicName.equals(b.getSymbolicName())) {
                    if (bundle == null || b.getState() == Bundle.ACTIVE) {
                        bundle = b;
                    }
                }
            }

            if (bundle == null) {
                skipped.add(symbolicName + " (not found)");
                continue;
            }

            // Use exact 3-part version (major.minor.micro) — never a range
            org.osgi.framework.Version v = bundle.getVersion();
            String version = v.getMajor() + "." + v.getMinor() + "." + v.getMicro();
            if (v.getQualifier() != null && !v.getQualifier().isEmpty()
                    && !v.getQualifier().equalsIgnoreCase("SNAPSHOT")) {
                version = version + "." + v.getQualifier();
            }

            if (version.toUpperCase().contains(SNAPSHOT)) {
                skipped.add(symbolicName + " (SNAPSHOT)");
                continue;
            }

            // Determine Maven groupId — same logic as listAvailableUpdates
            String groupId = null;
            String location = bundle.getLocation();
            if (location != null && location.startsWith("mvn:")) {
                String[] parts = StringUtils.substringAfter(location, "mvn:").split("/");
                if (parts.length >= 2) {
                    groupId = parts[0];
                }
            }

            if (groupId == null) {
                Dictionary<String, String> headers = bundle.getHeaders();
                if (headers.get("Jahia-GroupId") != null) {
                    groupId = headers.get("Jahia-GroupId");
                }
            }

            if (groupId == null) {
                skipped.add(symbolicName + " (groupId unknown)");
                continue;
            }

            // 4-space indent so the list is unambiguously the value of installOrUpgradeBundle
            sb.append("    - url: 'mvn:").append(groupId).append("/")
              .append(symbolicName).append("/").append(version).append("'\n");
            included.add(symbolicName);
        }

        sb.append("  autoStart: true\n");
        sb.append("  uninstallPreviousVersion: true\n");
        sb.append("  ignoreChecks: true\n");

        if (!included.isEmpty()) {
            sb.append("- karafCommand: \"log:log 'Provisioning script applied: ")
              .append(String.join(", ", included)).append("'\"\n");
        }

        if (!skipped.isEmpty()) {
            sb.append("# Excluded modules: ").append(String.join(", ", skipped)).append("\n");
        }

        return sb.toString();
    }

    /**
     * Recursively walk {@code folder} and populate {@code result} with:
     * {@code moduleFolderPath → list of version-folder nodes}.
     * <p>
     * A <em>version folder</em> is a {@code jnt:moduleManagementBundleFolder}
     * that directly contains at least one {@code jnt:moduleManagementBundle} child.
     * Its parent is treated as the symbolic-name folder.
     */
    private void collectVersionFolders(javax.jcr.Node folder,
                                       Map<String, List<javax.jcr.Node>> result) throws RepositoryException {        javax.jcr.NodeIterator children = folder.getNodes();
        while (children.hasNext()) {
            javax.jcr.Node child = children.nextNode();
            if (!child.isNodeType("jnt:moduleManagementBundleFolder")) {
                continue;
            }
            if (hasModuleBundleChild(child)) {
                // child is a version folder — its parent (folder) is the symbolic-name folder
                result.computeIfAbsent(folder.getPath(), k -> new ArrayList<>()).add(child);
            } else {
                // Recurse: this might be a groupId path component or symbolic-name folder
                collectVersionFolders(child, result);
            }
        }
    }

    /** Returns {@code true} if {@code folder} has at least one {@code jnt:moduleManagementBundle} child. */
    private boolean hasModuleBundleChild(javax.jcr.Node folder) throws RepositoryException {
        javax.jcr.NodeIterator it = folder.getNodes();
        while (it.hasNext()) {
            if (it.nextNode().isNodeType("jnt:moduleManagementBundle")) {
                return true;
            }
        }
        return false;
    }

    /**
     * Sum the {@code jcr:data} binary sizes of all {@code jnt:moduleManagementBundle} children
     * in a version folder.
     */
    private long computeVersionFolderSize(javax.jcr.Node versionFolder) throws RepositoryException {
        long size = 0;
        javax.jcr.NodeIterator it = versionFolder.getNodes();
        while (it.hasNext()) {
            javax.jcr.Node child = it.nextNode();
            if (child.hasNode("jcr:content")) {
                javax.jcr.Node content = child.getNode("jcr:content");
                if (content.hasProperty("jcr:data")) {
                    javax.jcr.Binary bin = content.getProperty("jcr:data").getBinary();
                    try {
                        size += bin.getSize();
                    } finally {
                        bin.dispose();
                    }
                }
            }
        }
        return size;
    }

    private boolean checkImported(final JahiaTemplatesPackage jahiaTemplatesPackage) {

        try {

            boolean imported = jcrTemplate.doExecuteWithSystemSessionAsUser(null, null, null, new JCRCallback<Boolean>() {

                @Override
                public Boolean doInJCR(JCRSessionWrapper session) throws RepositoryException {
                    String path = "/modules/" + jahiaTemplatesPackage.getId() + "/" + jahiaTemplatesPackage.getVersion();
                    return session.itemExists(path);
                }
            });
            if (!imported) {
                return false;
            }
        } catch (RepositoryException e) {
            logger.error("Error while reading module jcr content" + jahiaTemplatesPackage, e);
        }
        return true;
    }

    private void scanForImportFiles(Bundle bundle, JahiaTemplatesPackage jahiaTemplatesPackage) {
        List<Resource> importFiles = new ArrayList<>();
        Enumeration<URL> importXMLEntryEnum = bundle.findEntries("META-INF", "import*.xml", false);
        if (importXMLEntryEnum != null) {
            while (importXMLEntryEnum.hasMoreElements()) {
                importFiles.add(new BundleResource(importXMLEntryEnum.nextElement(), bundle));
            }
        }
        Enumeration<URL> importZIPEntryEnum = bundle.findEntries("META-INF", "import*.zip", false);
        if (importZIPEntryEnum != null) {
            while (importZIPEntryEnum.hasMoreElements()) {
                importFiles.add(new BundleResource(importZIPEntryEnum.nextElement(), bundle));
            }
        }
        importFiles.sort(Comparator.comparing(o -> org.apache.commons.lang.StringUtils.substringBeforeLast(o.getFilename(), ".")));
        for (Resource importFile : importFiles) {
            try {
                jahiaTemplatesPackage.addInitialImport(importFile.getURL().getPath());
            } catch (IOException e) {
                logger.error("Error retrieving URL for resource " + importFile, e);
            }
        }
    }

    private static String getBundleKey(String key) {
        if (key.startsWith("org.jahia.modules/")) {
            key = key.substring("org.jahia.modules/".length());
        }
        return key;
    }

    private List<Version> getVersions(Bundle bundle, MavenResolver resolver, Artifact artifact) {
        VersionScheme versionScheme = new GenericVersionScheme();

        VersionConstraint versionConstraint;
        try {
            versionConstraint = versionScheme.parseVersionConstraint(getVersion(bundle.getVersion()));
            logger.debug("Checking for updates for {} : {}", artifact, versionConstraint.getRange());
        } catch (InvalidVersionSpecificationException e) {
            throw new DataFetchingException(e);
        }
        try {
            Version bundleVersion = versionScheme.parseVersion(bundle.getVersion().toString());
            File file = resolver.resolveMetadata(artifact.getGroupId(), artifact.getArtifactId(), "maven-metadata.xml", null);
            if (file != null && file.exists()) {
                List<Version> versions = getVersions(bundle, file, versionScheme, versionConstraint, bundleVersion);
                logger.debug("Found {} versions", versions.size());
                if (logger.isDebugEnabled()) {
                    versions.forEach(version ->
                            logger.debug("Version : {}", version)
                    );
                }
                return versions;
            }
        } catch (IOException | InvalidVersionSpecificationException e) {
            throw new DataFetchingException(e);
        }
        return Collections.emptyList();
    }

    private List<Version> getVersions(Bundle bundle, File file, VersionScheme versionScheme, VersionConstraint versionConstraint, Version bundleVersion) {
        List<Version> versions = new ArrayList<>();
        try (InputStream in = Files.newInputStream(file.toPath())) {
            Versioning versioning = (new MetadataXpp3Reader()).read(in, false).getVersioning();
            versioning.getVersions().stream().filter(s -> {
                try {
                    Version version = versionScheme.parseVersion(s);
                    logger.debug("Checking version: {} for bundle {}", version, bundle.getSymbolicName());
                    if (!(version.toString().contains(SNAPSHOT))) {
                        return versionConstraint.getRange().containsVersion(version) && version.compareTo(bundleVersion) > 0;
                    } else {
                        logger.debug("Skipping SNAPSHOT version: {}", version);
                        return false;
                    }
                } catch (InvalidVersionSpecificationException e) {
                    throw new DataFetchingException(e);
                }
            }).forEach(version -> {
                try {
                    versions.add(versionScheme.parseVersion(version));
                } catch (InvalidVersionSpecificationException e) {
                    throw new JahiaRuntimeException(e);
                }
            });
        } catch (IOException | XmlPullParserException e) {
            throw new DataFetchingException(e);
        }
        return versions;
    }

    private String getVersion(org.osgi.framework.Version version) {
        int major = version.getMajor();
        return "[" + major + "," + (major + 1) + ")";
    }
}
