import React from 'react';
import * as PropTypes from 'prop-types';
import {useModuleLang} from '../hooks/useModuleLang';

/** Sets the language of the module text on a screen that has no root element of its own in this module. */
export const ModuleLangRoot = ({children}) => {
    const lang = useModuleLang();
    // The display: contents style keeps the layout of the admin shell, and the lang attribute still applies to the children.
    return <div lang={lang} style={{display: 'contents'}}>{children}</div>;
};

ModuleLangRoot.propTypes = {
    children: PropTypes.node
};

export default ModuleLangRoot;
