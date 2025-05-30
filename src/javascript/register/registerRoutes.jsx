import {registry} from '@jahia/ui-extender';
import React from 'react';
import ModuleManagementCommunityEntry from '~/components/ModuleManagementCommunityEntry';

export const registerRoutes = () => {
    const COMP_NAME = 'moduleManagementCommunity';


    registry.add('adminRoute', `${COMP_NAME}`, {
        targets: ['administration-server-systemComponents:33'],
        label: 'Module Management Community',
        isSelectable: true,
        requiredPermission: 'adminTemplates',
        render: () => registry.get('route', 'requireCoreLicenseRoot').render() || <ModuleManagementCommunityEntry/>
    });
};
