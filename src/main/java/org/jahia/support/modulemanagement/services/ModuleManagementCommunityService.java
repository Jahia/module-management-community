package org.jahia.support.modulemanagement.services;

import org.apache.karaf.features.Feature;
import org.osgi.framework.Bundle;

import javax.jcr.RepositoryException;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;

public interface ModuleManagementCommunityService {

    Set<String> updateModules(boolean jahiaOnly, boolean dryRun, List<String> filters, boolean autostart, boolean uninstallPrevious) throws IOException;

    Set<String> listAvailableUpdates(boolean jahiaOnly, List<String> filters) throws IOException;

    List<Feature> getFeatures(boolean jahiaOnly, List<String> filters) throws IOException;

    Set<String> getInstalledModules() throws IOException;

    Instant getLastUpdateTime();

    Bundle getBundleById(long bundleId);

    List<String> getSitesDeployment(Bundle bundle) throws RepositoryException;

    boolean importModule(Bundle bundle, boolean force) throws IOException;
}
