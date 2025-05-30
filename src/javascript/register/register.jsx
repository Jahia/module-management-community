import {registerRoutes} from './registerRoutes';
import hashes from './localesHash!';

window.jahia.localeFiles = window.jahia.localeFiles || {};
window.jahia.localeFiles['module-management-community'] = hashes;

export const register = () => {
    registerRoutes();
};
