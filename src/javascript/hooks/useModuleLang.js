import {useTranslation} from 'react-i18next';

const NAMESPACE = 'module-management-community';

/**
 * The language of the module text when it differs from the admin language, such as "en" in a French admin
 * when the module has no French translation. Undefined when the module text is in the admin language.
 */
export const useModuleLang = () => {
    const {i18n} = useTranslation(NAMESPACE, {useSuspense: false});
    const shown = (i18n.languages || []).find(lng => i18n.hasResourceBundle(lng, NAMESPACE));
    const primary = lng => (lng || '').split('-')[0];
    return shown && primary(shown) !== primary(i18n.language) ? shown : undefined;
};
