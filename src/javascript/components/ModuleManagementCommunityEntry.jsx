import React, {Suspense} from 'react';
import {useTranslation} from 'react-i18next';
import ModuleManagementCommunityApp from './ModuleManagementCommunityApp';
import {StatusAnnouncer} from './StatusAnnouncer';
import {useModuleLang} from '../hooks/useModuleLang';
import styles from './ModuleManagementCommunityEntry.scss';

export const ModuleManagementCommunityEntry = () => {
    const {t} = useTranslation('module-management-community', {useSuspense: false});
    const lang = useModuleLang();
    return (
        <Suspense fallback={
            <div role="status" lang={lang}>
                <span className={styles.srOnly}>{t('label.loading')}</span>
            </div>
        }
        >
            <div className={styles.root} id="module-management-community-root" lang={lang}>
                <StatusAnnouncer>
                    <ModuleManagementCommunityApp/>
                </StatusAnnouncer>
            </div>
        </Suspense>
    );
};

export default ModuleManagementCommunityEntry;
