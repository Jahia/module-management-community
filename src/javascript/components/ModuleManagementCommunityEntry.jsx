import React, {Suspense} from 'react';
import ModuleManagementCommunityApp from './ModuleManagementCommunityApp';
import {Button, GlobalStyle, Help, Separator, Typography} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './ModuleManagementCommunityEntry.scss';
import {capitalize} from '@material-ui/core/utils/helpers';

const ModuleManagementCommunityEntry = () => {
    const {t} = useTranslation('module-management-community');
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
                                    label={t('label.help')}
                                    icon={<Help/>}
                                    onClick={() => {
                                        window.open(t('help.url'), 'Module Management Community - Help');
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

export default ModuleManagementCommunityEntry;
