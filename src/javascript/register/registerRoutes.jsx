import {registry} from '@jahia/ui-extender';
import React from 'react';
import ModuleManagementCommunityEntry from '~/components/ModuleManagementCommunityEntry';
import ServerStatusApp from '~/components/ServerStatusApp';
import ServerStatusNavIcon from '~/components/ServerStatusNavIcon';

export const registerRoutes = () => {
    const COMP_NAME = 'module-management-community';

    registry.add('adminRoute', `${COMP_NAME}`, {
        targets: ['administration-server-systemComponents:33'],
        label: 'Module Management Community',
        isSelectable: true,
        requiredPermission: 'adminTemplates',
        render: () => registry.get('route', 'requireCoreLicenseRoot').render() || <ModuleManagementCommunityEntry/>
    });

    registry.add('adminRoute', 'server-status-community', {
        targets: ['administration-server-systemComponents:34'],
        label: 'Server Status Community',
        icon: <ServerStatusNavIcon/>,
        isSelectable: true,
        requiredPermission: 'adminTemplates',
        render: () => registry.get('route', 'requireCoreLicenseRoot').render() || <ServerStatusApp/>
    });
};
