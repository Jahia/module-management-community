package org.jahia.support.modulemanagement.services;

import org.apache.karaf.features.Feature;

import java.io.IOException;
import java.util.List;

public interface ModuleManagementCommunityService {

    List<String> updateModules(boolean jahiaOnly, boolean dryRun, List<String> filters) throws IOException;

    List<Feature> getFeatures(boolean jahiaOnly, List<String> filters) throws IOException;
}
