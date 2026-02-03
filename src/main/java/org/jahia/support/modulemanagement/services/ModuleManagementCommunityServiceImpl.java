package org.jahia.support.modulemanagement.services;

import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.io.FileUtils;
import org.apache.commons.lang3.StringUtils;
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
import org.jahia.support.modulemanagement.config.ModuleManagementCommunityConfig;
import org.ops4j.pax.url.mvn.MavenResolver;
import org.osgi.framework.Bundle;
import org.osgi.framework.BundleContext;
import org.osgi.framework.startlevel.BundleStartLevel;
import org.osgi.framework.wiring.BundleWiring;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.ConfigurationPolicy;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.metatype.annotations.Designate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;

import javax.jcr.RepositoryException;
import javax.jcr.query.Query;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
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
    public Set<String> updateModules(boolean jahiaOnly, boolean dryRun, List<String> filters, boolean autostart, boolean uninstallPrevious, boolean forceUpdateAll, boolean onStartup) throws IOException {
        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            logger.warn(SERVICE_IS_NOT_AVAILABLE_IN_READ_ONLY_MODE);
            return Collections.emptySet();
        }
        if (!settingsBean.isProcessingServer()) {
            logger.warn("ModuleManagementCommunityService is available only on processing servers");
            return Collections.emptySet();
        }

        if (!dryRun && !jahiaOnly && CollectionUtils.isEmpty(filters)) {
            throw new DataFetchingException("Updating all available bundles not permitted");
        }

        // Get or refresh the list of available updates
        Set<String> updates = listAvailableUpdates(jahiaOnly, filters, false);
        if (updates.isEmpty()) {
            return Collections.emptySet();
        }

        if (!forceUpdateAll && (maxModulesToUpdate > 0 && updates.size() >= maxModulesToUpdate)) {
            logger.warn("Found {} modules with updates, consider reviewing the list before proceeding", updates.size());
            throw new DataFetchingException("Found " + updates.size() +
                    " modules with updates, please refine filters or run in dryRun mode");
        }

        if (logger.isInfoEnabled()) {
            logger.info("Updating modules: {}", String.join(", ", updates));
        }

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
                FileUtils.write(Path.of(settingsBean.getJahiaVarDiskPath(),"patches","provisioning", CLUSTER_SYNCHRONIZED_YAML_SKIPPED).toFile(), yamlScript, StandardCharsets.UTF_8, true);
            } else {
                FileUtils.write(Path.of(settingsBean.getJahiaVarDiskPath(),"patches","provisioning","module-management-community.yaml").toFile(), yamlScript, StandardCharsets.UTF_8, true);
                modulesWithUpdates = null; // Clear the cache after execution
            }
        } else {
            FileUtils.write(File.createTempFile("module-management-community",".yaml"), yamlScript, "UTF-8", true);
            logger.info("Dry run mode enabled, not executing provisioning script:\n{}", yamlScript);
        }

        return updates;
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
                logger.info("Skipping excluded module: {}", key);
                return;
            }
            logger.info("Checking for updates for {}", key);
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
            logger.info("Checking for updates for {} : {}", artifact, versionConstraint.getRange());
        } catch (InvalidVersionSpecificationException e) {
            throw new DataFetchingException(e);
        }
        try {
            Version bundleVersion = versionScheme.parseVersion(bundle.getVersion().toString());
            File file = resolver.resolveMetadata(artifact.getGroupId(), artifact.getArtifactId(), "maven-metadata.xml", null);
            if (file != null && file.exists()) {
                List<Version> versions = getVersions(bundle, file, versionScheme, versionConstraint, bundleVersion);
                logger.info("Found {} versions", versions.size());
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
