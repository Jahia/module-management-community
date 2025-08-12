import React, {Suspense, useState} from 'react';
import ModuleManagementCommunityApp from './ModuleManagementCommunityApp';
import {Badge, Button, Cancel, Check, Close, GlobalStyle, Help, Separator, Typography, Warning} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './ModuleManagementCommunityEntry.scss';
import {capitalize} from '@material-ui/core/utils/helpers';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import * as PropTypes from 'prop-types';

const HealthStatus = ({status, probes}) => {
    const {t} = useTranslation('module-management-community');
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const handleBadgeClick = () => {
        if (probes && probes.length > 0) {
            setIsDialogOpen(true);
        }
    };

    const closeDialog = () => {
        setIsDialogOpen(false);
    };

    if (probes && probes.length > 0) {
        //

    }

    // Render status badge with click handler if probes exist
    const renderStatusBadge = () => {
        let buttonClass = '';
        let buttonIcon = null;

        if (status === 'GREEN') {
            buttonClass = 'green';
            buttonIcon = <Check/>;
        } else if (status === 'YELLOW') {
            buttonClass = 'yellow';
            buttonIcon = <Warning/>;
        } else {
            buttonClass = 'red';
            buttonIcon = <Cancel/>;
        }

        return (
            <Button variant="outlined"
                    size="big"
                    label=""
                    icon={buttonIcon}
                    className={`${styles.statusButton} ${styles[buttonClass]}`}
                    onClick={handleBadgeClick}/>
        );
    };

    return (
        <>
            <div className={styles.row}>
                <Typography variant="subheading">
                    {t('label.sam.status')}
                </Typography>
                {renderStatusBadge()}
            </div>

            {isDialogOpen && (
                <div className={styles.probeDialog}>
                    <div className={styles.probeDialogContent}>
                        <div className={styles.probeDialogHeader}>
                            <Typography variant="title">{t('label.sam.probes.title')}</Typography>
                            <Button
                                variant="ghost"
                                icon={<Close/>}
                                onClick={closeDialog}
                            />
                        </div>

                        <div className={styles.probeDialogBody}>
                            <table className={styles.probeTable}>
                                <thead>
                                    <tr>
                                        <th>{t('label.sam.probes.name')}</th>
                                        <th>{t('label.sam.probes.description')}</th>
                                        <th>{t('label.sam.probes.severity')}</th>
                                        <th>{t('label.sam.probes.status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* Sort the probes bny severity CRITICAL,HIGH,MEDIUM,LOW,DEBUG if same order by name */}
                                    {probes.sort((a, b) => {
                                        const severityOrder = {
                                            CRITICAL: 1,
                                            HIGH: 2,
                                            MEDIUM: 3,
                                            LOW: 4,
                                            DEBUG: 5
                                        };
                                        let order = severityOrder[a.severity] - severityOrder[b.severity];
                                        return order === 0 ? a.name.localeCompare(b.name) : order;
                                    }).map(probe => (
                                        <tr key={probe.name}>
                                            <td>{probe.name}</td>
                                            <td>{probe.description || '-'}</td>
                                            <td>{probe.severity}</td>
                                            <td>
                                                <Badge
                                                color={
                                                    probe.status.health === 'GREEN' ? 'success' :
                                                        probe.status.health === 'YELLOW' ? 'accent' : 'danger'
                                                }
                                                label={probe.status.health}
                                            />
                                            </td>
                                        </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.probeDialogFooter}>
                            <Button
                                variant="outlined"
                                size="big"
                                color="accent"
                                label={t('label.close')}
                                onClick={closeDialog}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

HealthStatus.propTypes = {
    status: PropTypes.string,
    probes: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string.isRequired,
        description: PropTypes.string,
        severity: PropTypes.string,
        status: PropTypes.shape({
            health: PropTypes.string.isRequired
        }).isRequired
    }))
};
const ModuleManagementCommunityEntry = () => {
    const {t} = useTranslation('module-management-community');
    const {data, error, loading} = useQuery(gql`
        query GetServerStatus {
            admin {
                jahia {
                    healthCheck (severity: HIGH) {
                        status {
                            health
                        }
                        probes {
                            name
                            description
                            severity
                            status {
                                health
                            }
                        }
                    }
                }
            }
        }`, {
        fetchPolicy: 'network-only',
        pollInterval: 30000});

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
                            {/* Status from server availability manager API if available */}
                            {loading ? (
                                <Typography variant="body" className={styles.status}>
                                    {t('label.sam.loadingStatus')}
                                </Typography>
                            ) : error ? (
                                <Typography variant="body" className={styles.status}>
                                    {t('label.sam.errorStatus', {error: error.message})}
                                </Typography>
                            ) : (
                                <HealthStatus status={data?.admin?.jahia?.healthCheck?.status?.health} probes={data?.admin?.jahia?.healthCheck?.probes}/>
                            )}
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
