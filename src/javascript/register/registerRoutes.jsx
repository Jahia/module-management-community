import {registry} from '@jahia/ui-extender';
import React from 'react';
import ModuleManagementCommunityEntry from '~/components/ModuleManagementCommunityEntry';
import ServerStatusApp from '~/components/ServerStatusApp';
import ServerStatusNavIcon from '~/components/ServerStatusNavIcon';
import ModuleLangRoot from '~/components/ModuleLangRoot';

export const registerRoutes = () => {
    const COMP_NAME = 'module-management-community';

    registry.add('adminRoute', `${COMP_NAME}`, {
        targets: ['administration-server-systemComponents:33'],
        // The admin shell passes the label through t(), so a namespaced key makes it translatable.
        label: 'module-management-community:label.routes.modules',
        isSelectable: true,
        requiredPermission: 'adminTemplates',
        render: () => registry.get('route', 'requireCoreLicenseRoot').render() || <ModuleManagementCommunityEntry/>
    });

    registry.add('adminRoute', 'server-status-community', {
        targets: ['administration-server-systemComponents:34'],
        label: 'module-management-community:label.routes.serverStatus',
        icon: <ServerStatusNavIcon/>,
        isSelectable: true,
        requiredPermission: 'adminTemplates',
        render: () => registry.get('route', 'requireCoreLicenseRoot').render() || <ModuleLangRoot><ServerStatusApp/></ModuleLangRoot>
    });
};
