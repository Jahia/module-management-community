package org.jahia.support.modulemanagement.graphql;

import graphql.annotations.annotationTypes.GraphQLDefaultValue;
import graphql.annotations.annotationTypes.GraphQLDescription;
import graphql.annotations.annotationTypes.GraphQLField;
import graphql.annotations.annotationTypes.GraphQLName;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.jahia.modules.graphql.provider.dxm.util.GqlUtils;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityService;
import org.jahia.support.modulemanagement.services.ModuleManagementCommunityServiceImpl;

import javax.inject.Inject;
import java.io.IOException;
import java.util.List;

public class ModuleManagementQueryResult {

    @Inject
    @GraphQLOsgiService(
            service = ModuleManagementCommunityService.class
    )
    ModuleManagementCommunityService moduleManagementCommunityService;

    @GraphQLField
    @GraphQLName("availableUpdates")
    @GraphQLDescription("Return a list of modules that have updates available")
    public List<String> getAvailableUpdates(@GraphQLName("jahiaOnly") @GraphQLDefaultValue(GqlUtils.SupplierTrue.class) boolean jahiaOnly,
                                      @GraphQLName("filters") List<String> filters) throws IOException {
        return moduleManagementCommunityService.updateModules(jahiaOnly, true, filters);
    }

}
