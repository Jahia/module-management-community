import React, {Suspense} from 'react';
import * as PropTypes from 'prop-types';
import ModuleManagementCommunityApp from './ModuleManagementCommunityApp';
import {Button, GlobalStyle, Help, Separator, Typography} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './ModuleManagementCommunityEntry.scss';
import {capitalize} from '@material-ui/core/utils/helpers';

const ModuleManagementCommunityEntry = ({dxContext}) => {
    const {t} = useTranslation('moduleManagementCommunity');
    return (
        <Suspense fallback="loading ...">
            <GlobalStyle/>
            <div className={styles.root}>
                <div className={styles.headerRoot}>
                    <header className={styles.header}>
                        <Typography variant="title"
                                    weight="semiBold"
                        >{capitalize(t('label.title'))}
                        </Typography>
                        <div className={styles.actionBar}>
                            <Button variant="ghost"
                                    size="big"
                                    color="default"
                                    label={t('augmented-search:help.label')}
                                    icon={<Help/>}
                                    onClick={() => {
                                        window.open(t('augmented-search:help.url'), 'Augmented Search - Help');
                                    }}/>
                        </div>
                    </header>
                    <Separator size="large" variant="horizontal" spacing="medium"/>
                </div>
                <div className={styles.content}>
                    <ModuleManagementCommunityApp/>
                </div>
            </div>
        </Suspense>
    );
};

ModuleManagementCommunityEntry.propTypes = {
    dxContext: PropTypes.object.isRequired
};

export default ModuleManagementCommunityEntry;
