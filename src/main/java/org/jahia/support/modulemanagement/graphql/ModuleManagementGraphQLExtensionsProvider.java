package org.jahia.support.modulemanagement.graphql;

import org.jahia.modules.graphql.provider.dxm.DXGraphQLExtensionsProvider;
import org.osgi.service.component.annotations.Component;

import java.util.Collection;
import java.util.Collections;

/**
 * Extension provider for GraphQL
 */
@Component(service = DXGraphQLExtensionsProvider.class, immediate = true)
public class ModuleManagementGraphQLExtensionsProvider implements DXGraphQLExtensionsProvider {

    @Override
    public Collection<Class<?>> getExtensions() {
        return Collections.<Class<?>>singletonList(ModuleManagementMutations.class);
    }
}
