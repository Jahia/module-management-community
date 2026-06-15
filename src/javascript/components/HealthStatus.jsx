import React, {useState} from 'react';
import * as PropTypes from 'prop-types';
import {Button, Cancel, Check, Close, Typography, Warning} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import dayjs from 'dayjs';
import styles from './HealthStatus.scss';

/**
 * Renders a probe status message — truncates plain text, pretty-prints JSON.
 */
const MessageRenderer = ({message}) => {
    try {
        const jsonData = JSON.parse(message);
        return <Typography variant="caption">{JSON.stringify(jsonData, null, 2)}</Typography>;
    } catch (_) {
        const maxWords = 50;
        const words = message.split(/\s+/);
        const shortMessage = words.length > maxWords ?
            words.slice(0, maxWords).join(' ') + '...' :
            message;
        return <Typography variant="caption">{shortMessage}</Typography>;
    }
};

MessageRenderer.propTypes = {
    message: PropTypes.string.isRequired
};

/**
 * Server health-status badge.
 * Shows Jahia version info and a colour-coded GREEN / YELLOW / RED button.
 * Clicking the button opens a probe details modal when probes are available.
 */
export const HealthStatus = ({status, probes, version}) => {
    const {t} = useTranslation('module-management-community');
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const handleBadgeClick = () => {
        if (probes && probes.length > 0) {
            setIsDialogOpen(true);
        }
    };

    const renderStatusBadge = s => {
        let buttonClass = 'red';
        let buttonIcon = <Cancel/>;
        if (s === 'GREEN') {
            buttonClass = 'green';
            buttonIcon = <Check/>;
        } else if (s === 'YELLOW') {
            buttonClass = 'yellow';
            buttonIcon = <Warning/>;
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

    const SEVERITY_ORDER = {CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4, DEBUG: 5};
    const STATUS_ORDER = {GREEN: 3, YELLOW: 2, RED: 1};

    const sortedProbes = probes ? [...probes].sort((a, b) => {
        if (a.status.health !== b.status.health) {
            return STATUS_ORDER[a.status.health] - STATUS_ORDER[b.status.health];
        }

        const order = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        return order === 0 ? a.name.localeCompare(b.name) : order;
    }) : [];

    return (
        <>
            <div className={styles.row}>
                <div className={styles.column}>
                    <Typography variant="subheading">{t('label.sam.status')}</Typography>
                    {version && (
                        <>
                            <Typography variant="body">
                                {t('label.sam.version', {version: version.release})}
                            </Typography>
                            {version.buildDate && (
                                <Typography variant="body">
                                    {t('label.sam.buildDate', {date: dayjs(version.buildDate).format('YYYY-MM-DD')})}
                                </Typography>
                            )}
                            <Typography variant="body">
                                {t('label.sam.buildNumber', {number: version.build})}
                            </Typography>
                        </>
                    )}
                </div>
                {renderStatusBadge(status)}
            </div>

            {isDialogOpen && (
                <div className={styles.probeDialog}>
                    <div className={styles.probeDialogContent}>
                        <div className={styles.probeDialogHeader}>
                            <Typography variant="title">{t('label.sam.probes.title')}</Typography>
                            <Button variant="ghost" icon={<Close/>} onClick={() => setIsDialogOpen(false)}/>
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
                                    {sortedProbes.map(probe => (
                                        <tr key={probe.name}>
                                            <td>{probe.name}</td>
                                            <td>
                                                <div className={styles.probeInfo}>
                                                    <div className={styles.probeDescription}>
                                                        {probe.description || t('label.sam.probes.noDescription')}
                                                    </div>
                                                    {probe.status.message && (
                                                        <div className={styles.probeMessage}>
                                                            <MessageRenderer message={probe.status.message}/>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>{probe.severity}</td>
                                            <td>{renderStatusBadge(probe.status.health)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className={styles.probeDialogFooter}>
                            <Button variant="outlined"
                                    size="big"
                                    color="accent"
                                    label={t('label.close')}
                                    onClick={() => setIsDialogOpen(false)}/>
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
            health: PropTypes.string.isRequired,
            message: PropTypes.string.isRequired
        }).isRequired
    })),
    version: PropTypes.shape({
        release: PropTypes.string,
        buildDate: PropTypes.string,
        build: PropTypes.string
    })
};

