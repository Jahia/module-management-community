package org.jahia.support.modulemanagement.graphql;

import org.jahia.api.settings.SettingsBean;
import org.jahia.modules.graphql.provider.dxm.DXGraphQLExtensionsProvider;
import org.jahia.modules.graphql.provider.dxm.osgi.annotations.GraphQLOsgiService;
import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import javax.inject.Inject;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;

/**
 * Extension provider for GraphQL
 */
@Component(service = DXGraphQLExtensionsProvider.class, immediate = true)
public class ModuleManagementGraphQLExtensionsProvider implements DXGraphQLExtensionsProvider {

    @Reference
    SettingsBean settingsBean;

    @Override
    public Collection<Class<?>> getExtensions() {
        return Arrays.asList(
                settingsBean.isClusterActivated() ? ClusteredModuleManagementMutations.class : ModuleManagementMutations.class,
                ModuleManagementQuery.class);
    }
}
