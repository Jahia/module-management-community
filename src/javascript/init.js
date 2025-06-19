import {registry} from '@jahia/ui-extender';
import i18next from 'i18next';
import {register} from './register/register';

export default function () {
    registry.add('callback', 'moduleManagementCommunity', {
        targets: ['jahiaApp-init:99'],
        callback: async () => {
            await i18next.loadNamespaces('module-management-community');
            register();
            console.log('%c moduleManagementCommunity registered routes', 'color: #3c8cba');
        }
    });
}
