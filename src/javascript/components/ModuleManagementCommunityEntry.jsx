import React, {Suspense} from 'react';
import ModuleManagementCommunityApp from './ModuleManagementCommunityApp';
import {Help, Separator, Typography, Button} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './ModuleManagementCommunityEntry.scss';
import {capitalize} from '@material-ui/core/utils/helpers';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {HealthStatus} from './HealthStatus';

export const ModuleManagementCommunityEntry = () => {
    const {t} = useTranslation('module-management-community');
    const {data, error, loading} = useQuery(gql`
        query GetServerStatus {
            admin {
                jahia {
                    version { release buildDate build }
                    healthCheck(severity: HIGH) {
                        status { health }
                        probes {
                            name description severity
                            status { health message }
                        }
                    }
                }
            }
        }`, {
        fetchPolicy: 'network-only',
        pollInterval: 30000
    });

    return (
        /* A11y B-013: Suspense fallback as accessible live region */
        <Suspense fallback={
            <div role="status" aria-live="polite" aria-label="Loading">
                <span className="srOnly">Loading…</span>
            </div>
        }>
            <div className={styles.root} id="module-management-community-root">
                <div className={styles.headerRoot}>
                    <header className={styles.header}>
                        <div className={styles.titles}>
                            <Typography variant="title">{capitalize(t('label.title'))}</Typography>
                            <Typography variant="subheading">{t('label.subtitle')}</Typography>
                        </div>
                        <div className={styles.actionBar}>
                            {/* A11y B-011: indicate new window opens */}
                            <Button variant="ghost"
                                    size="big"
                                    color="default"
                                    label={t('label.help')}
                                    icon={<Help/>}
                                    aria-label={`${t('label.help')} (opens in a new window)`}
                                    onClick={() => {
                                        window.open(t('help.url'), '_blank', 'noopener,noreferrer');
                                    }}/>
                            {loading ? (
                                <Typography variant="body" className={styles.status} role="status" aria-live="polite">
                                    {t('label.sam.loadingStatus')}
                                </Typography>
                            ) : error ? (
                                <Typography variant="body" className={styles.status}>
                                    {t('label.sam.errorStatus', {error: error.message})}
                                </Typography>
                            ) : (
                                <HealthStatus
                                    status={data?.admin?.jahia?.healthCheck?.status?.health}
                                    probes={data?.admin?.jahia?.healthCheck?.probes}
                                    version={data?.admin?.jahia?.version}
                                />
                            )}
                        </div>
                    </header>
                    <Separator size="large" variant="horizontal" spacing="medium" aria-hidden="true"/>
                </div>
                <div className={styles.content}>
                    <ModuleManagementCommunityApp/>
                </div>
            </div>
        </Suspense>
    );
};

export default ModuleManagementCommunityEntry;
