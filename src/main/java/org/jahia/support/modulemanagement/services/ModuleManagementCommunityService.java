package org.jahia.support.modulemanagement.services;

import java.io.IOException;
import java.util.List;

public interface ModuleManagementCommunityService {

    List<String> updateModules(boolean jahiaOnly, boolean dryRun, List<String> filters) throws IOException;
}
