package org.jahia.support.modulemanagement.services;

import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
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
import org.jahia.exceptions.JahiaRuntimeException;
import org.jahia.modules.graphql.provider.dxm.DataFetchingException;
import org.jahia.osgi.BundleState;
import org.jahia.osgi.BundleUtils;
import org.jahia.services.modulemanager.ModuleManager;
import org.jahia.services.modulemanager.spi.BundleService;
import org.jahia.services.provisioning.ProvisioningManager;
import org.jahia.settings.SettingsBean;
import org.jahia.support.modulemanagement.config.ModuleManagementCommunityConfig;
import org.ops4j.pax.url.mvn.MavenResolver;
import org.osgi.framework.Bundle;
import org.osgi.service.component.annotations.Activate;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.ConfigurationPolicy;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.metatype.annotations.Designate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Dictionary;
import java.util.List;
import java.util.regex.Pattern;

@Component( service = ModuleManagementCommunityService.class, immediate = true, configurationPid = "org.jahia.support.modulemanagement.services.ModuleManagementCommunityService", configurationPolicy = ConfigurationPolicy.REQUIRE)
@Designate(ocd = ModuleManagementCommunityConfig.class)
public class ModuleManagementCommunityServiceImpl implements ModuleManagementCommunityService {
    private transient Logger logger = LoggerFactory.getLogger(ModuleManagementCommunityServiceImpl.class);

    @Reference
    ProvisioningManager provisioningManager;

    @Activate
    public void activate(ModuleManagementCommunityConfig config) {
        logger.info("ModuleManagementCommunityService activated");
        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            logger.warn("ModuleManagementCommunityService is not available in read-only mode");
            return;
        }
        if (settingsBean.isProcessingServer()) {
            if (config.updateOnModuleStartup()) {
                logger.info("ModuleManagementCommunityService is configured to update modules on startup");
//                try {
//                    updateModules(true, false, null);
//                } catch (IOException e) {
//                    logger.error("Error updating modules on startup", e);
//                }
            } else {
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
     * @return List of module names that have updates available or have been updated.
     * @throws IOException If an error occurs during the update process.
     */

    @Override
    public List<String> updateModules(boolean jahiaOnly, boolean dryRun, List<String> filters) throws IOException {
        SettingsBean settingsBean = SettingsBean.getInstance();
        if (settingsBean.isMaintenanceMode() || settingsBean.isReadOnlyMode() || settingsBean.isFullReadOnlyMode()) {
            logger.warn("ModuleManagementCommunityService is not available in read-only mode");
            return Collections.emptyList();
        }
        if (!settingsBean.isProcessingServer()) {
            logger.warn("ModuleManagementCommunityService is available only on processing servers");
            return Collections.emptyList();
        }
        List<String> modulesWithUpdates = new ArrayList<>();
        List<String> modulesWithUpdatesURLs = new ArrayList<>();
        ModuleManager moduleManager = BundleUtils.getOsgiService(ModuleManager.class, null);
        if (moduleManager == null) {
            throw new DataFetchingException("Module manager service is not available");
        }
        MavenResolver resolver = BundleUtils.getOsgiService(MavenResolver.class, null);
        if (resolver == null) {
            throw new DataFetchingException("Maven resolver service is not available");
        }
        if (!dryRun && !jahiaOnly && CollectionUtils.isEmpty(filters)) {
            throw new DataFetchingException("Updating all available bundles not permitted");
        }
        if (CollectionUtils.isNotEmpty(filters)) {
            if (filters.stream().anyMatch(filter -> filter.equals(".*") || filter.equals("^.*$"))) {
                throw new DataFetchingException("Updating all available bundles not permitted, please specify a valid filter");
            }
        }
        List<Pattern> patterns = new ArrayList<>();
        if (CollectionUtils.isNotEmpty(filters)) {
            filters.forEach(f -> patterns.add(Pattern.compile(f)));
        }
        moduleManager.getAllLocalInfos().entrySet().forEach(entry -> {
            BundleService.BundleInformation bundleInfo = entry.getValue();
            if (bundleInfo.getOsgiState() == BundleState.ACTIVE) {
                String key = getKeyIfBundleNameIsValid(jahiaOnly, filters, entry.getKey(), patterns);
                if (key == null) return;
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
                    Artifact artifact = null;
                    List<Version> versions = null;
                    if (location.startsWith("mvn:")) {
                        String[] parts = StringUtils.substringAfter(location, "mvn:").split("/");
                        logger.debug("Checking for updates for {} : {} : {}", parts[0], parts[1], parts[2]);
                        artifact = new DefaultArtifact(parts[0], parts[1], "jar", getVersion(bundle));
                    } else {
                        Dictionary<String, String> headers = bundle.getHeaders();
                        if (headers.get("Jahia-GroupId") != null) {
                            String groupId = headers.get("Jahia-GroupId");
                            artifact = new DefaultArtifact(groupId, bundle.getSymbolicName(), "jar", getVersion(bundle));
                        }
                    }
                    if (artifact != null) {
                        versions = getVersions(bundle, resolver, artifact);
                        if (!versions.isEmpty()) {
                            Version latestVersion = versions.get(versions.size() - 1);
                            if (!(latestVersion.toString().contains("SNAPSHOT")) && latestVersion.compareTo(bundleVersion) > 0) {
                                modulesWithUpdates.add(key + " : " + latestVersion);
                                modulesWithUpdatesURLs.add("mvn:" + artifact.getGroupId() + "/" + artifact.getArtifactId() + "/" + latestVersion);
                            }
                        }
                    }
                }
            }
        });
        Collections.sort(modulesWithUpdates);
        updateModulesIfNeeded(dryRun, modulesWithUpdates, modulesWithUpdatesURLs);
        return modulesWithUpdates;
    }

    private void updateModulesIfNeeded(boolean dryRun, List<String> modulesWithUpdates, List<String> modulesWithUpdatesURLs) throws IOException {
        if (!dryRun && !modulesWithUpdates.isEmpty()) {
            if (modulesWithUpdates.size() >= 10) {
                logger.warn("Found {} modules with updates, consider reviewing the list before proceeding with updates", modulesWithUpdates.size());
                throw new DataFetchingException("Found " + modulesWithUpdates.size() + " modules with updates, please refine filters or run in dryRun mode to review the list before proceeding with updates");
            }
            logger.info("Updating modules: {}", String.join(", ", modulesWithUpdatesURLs));

            StringBuilder sb = new StringBuilder();
            sb.append("- installBundle:\n");
            for (String bundle : modulesWithUpdatesURLs) {
                sb.append("  - '").append(bundle).append("'\n");
            }
            sb.append("  autoStart: true\n");
            sb.append("  uninstallPreviousVersion: true\n");
            sb.append("- karafCommand: \"log:log 'Bundles ").append(String.join(", ", modulesWithUpdates)).append(" installed'\"\n");

            String yamlScript = sb.toString();
            provisioningManager.executeScript(yamlScript, "yaml");
        }
    }

    private static String getKeyIfBundleNameIsValid(boolean jahiaOnly, List<String> filters, String key, List<Pattern> patterns) {
        if (CollectionUtils.isEmpty(filters) && jahiaOnly && !key.startsWith("org.jahia")) {
            return null;
        }
        if (key.startsWith("org.jahia.modules/")) {
            key = key.substring("org.jahia.modules/".length());
        }
        boolean found = true;
        if (!CollectionUtils.isEmpty(filters)) {
            String finalKey = StringUtils.substringBefore(key, "/");
            found = patterns.stream().anyMatch(filter -> {
                return filter.matcher(finalKey).matches();
            });
        }
        if (!found) {
            return null;
        }
        return key;
    }

    private List<Version> getVersions(Bundle bundle, MavenResolver resolver, Artifact artifact) {
        VersionScheme versionScheme = new GenericVersionScheme();

        VersionConstraint versionConstraint;
        try {
            versionConstraint = versionScheme.parseVersionConstraint(getVersion(bundle));
            logger.info("Checking for updates for {} : {}", artifact, versionConstraint.getRange());
        } catch (InvalidVersionSpecificationException e) {
            logger.error("Invalid version specification", e);
            throw new DataFetchingException(e);
        }
        try {
            Version bundleVersion = versionScheme.parseVersion(bundle.getVersion().toString());
            File file = resolver.resolveMetadata(artifact.getGroupId(), artifact.getArtifactId(), "maven-metadata.xml", null);
            if (file != null && file.exists()) {
                List<Version> versions = new ArrayList<>();
                try (InputStream in = Files.newInputStream(file.toPath())) {
                    Versioning versioning = (new MetadataXpp3Reader()).read(in, false).getVersioning();
                    versioning.getVersions().stream().filter(s -> {
                        try {
                            Version version = versionScheme.parseVersion(s);
                            logger.debug("Checking version: {} for bundle {}", version, bundle.getSymbolicName());
                            if (!(version.toString().contains("SNAPSHOT"))) {

                                return versionConstraint.getRange().containsVersion(version) && version.compareTo(bundleVersion) > 0;
                            } else {
                                logger.debug("Skipping SNAPSHOT version: {}", version);
                                return false;
                            }
                        } catch (InvalidVersionSpecificationException e) {
                            logger.error("Invalid version specification", e);
                            throw new DataFetchingException(e);
                        }
                    }).forEach(version -> {
                        try {
                            versions.add(versionScheme.parseVersion(version));
                        } catch (InvalidVersionSpecificationException e) {
                            throw new RuntimeException(e);
                        }
                    });
                } catch (IOException | XmlPullParserException e) {
                    throw new DataFetchingException(e);
                }
                logger.info("Found {} versions", versions.size());
                if (logger.isDebugEnabled()) {
                    versions.forEach(version -> {
                        logger.debug("Version : {}", version);
                    });
                }
                return versions;
            }
        } catch (IOException | InvalidVersionSpecificationException e) {
            throw new DataFetchingException(e);
        }
        return Collections.emptyList();
    }

    private String getVersion(Bundle bundle) {
        int major = bundle.getVersion().getMajor();
        return "[" + major + "," + (major + 1) + ")";
    }
}
