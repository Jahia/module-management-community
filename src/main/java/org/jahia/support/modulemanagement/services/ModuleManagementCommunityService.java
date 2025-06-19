package org.jahia.support.modulemanagement.services;

import org.apache.karaf.features.Feature;

import java.io.IOException;
import java.time.Instant;
import java.util.List;
import java.util.Set;

public interface ModuleManagementCommunityService {

    List<String> updateModules(boolean jahiaOnly, boolean dryRun, List<String> filters) throws IOException;

    List<Feature> getFeatures(boolean jahiaOnly, List<String> filters) throws IOException;

    Set<String> getInstalledModules() throws IOException;

    Instant getLastUpdateTime();
}
