import React, {useEffect, useRef, useState} from 'react';
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
    const openBtnRef = useRef(null); // A11y A-001: track trigger for focus return
    const dialogRef = useRef(null);

    const handleBadgeClick = () => {
        if (probes && probes.length > 0) {
            setIsDialogOpen(true);
        }
    };

    const handleClose = () => {
        setIsDialogOpen(false);
        // A11y A-001: return focus to trigger button on close
        setTimeout(() => openBtnRef.current?.focus(), 0);
    };

    // A11y C-002: keyboard focus trap — cycles Tab/Shift+Tab within the dialog
    const handleDialogKeyDown = e => {
        if (e.key === 'Escape') {
            handleClose();
            return;
        }

        if (e.key === 'Tab' && dialogRef.current) {
            const focusable = Array.from(dialogRef.current.querySelectorAll(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            ));
            if (focusable.length < 2) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    };

    // A11y A-001: move focus into dialog when it opens
    useEffect(() => {
        if (isDialogOpen && dialogRef.current) {
            const firstFocusable = dialogRef.current.querySelector(
                'button, [href], input, select, [tabindex]:not([tabindex="-1"])'
            );
            firstFocusable?.focus();
        }
    }, [isDialogOpen]);

    const renderStatusBadge = (s, ref) => {
        // A11y A-002: each status button has a descriptive aria-label
        if (s === 'GREEN') {
            return (
                <Button ref={ref}
                        variant="outlined"
                        size="big"
                        label=""
                        icon={<Check/>}
                        aria-label={t('label.sam.status.green', 'Server status: OK')}
                        className={`${styles.statusButton} ${styles.green}`}
                        onClick={handleBadgeClick}/>
            );
        }

        if (s === 'YELLOW') {
            return (
                <Button ref={ref}
                        variant="outlined"
                        size="big"
                        label=""
                        icon={<Warning/>}
                        aria-label={t('label.sam.status.yellow', 'Server status: Warning')}
                        className={`${styles.statusButton} ${styles.yellow}`}
                        onClick={handleBadgeClick}/>
            );
        }

        return (
            <Button ref={ref}
                    variant="outlined"
                    size="big"
                    label=""
                    icon={<Cancel/>}
                    aria-label={t('label.sam.status.red', 'Server status: Error')}
                    className={`${styles.statusButton} ${styles.red}`}
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
                {/* pass the ref only to the top-level badge */}
                {renderStatusBadge(status, openBtnRef)}
            </div>

            {isDialogOpen && (
                // A11y A-001 / C-002: proper dialog with focus trap via onKeyDown handler
                <div ref={dialogRef}
                     className={styles.probeDialog}
                     role="dialog"
                     aria-modal="true"
                     aria-labelledby="probe-dialog-title"
                     onKeyDown={handleDialogKeyDown}
                >
                    <div className={styles.probeDialogContent}>
                        <div className={styles.probeDialogHeader}>
                            {/* A11y C-001: semantic h2 — dialog title is the top heading in this modal */}
                            <Typography variant="title" component="h2">{t('label.sam.probes.title')}</Typography>
                            {/* A11y A-027: close button with accessible label */}
                            <Button variant="ghost"
                                    icon={<Close/>}
                                    aria-label={t('label.close', 'Close')}
                                    onClick={handleClose}/>
                        </div>
                        <div className={styles.probeDialogBody}>
                            {/* A11y A-006: table with aria-label and scope="col" on headers */}
                            <table className={styles.probeTable}
                                   aria-label={t('label.sam.probes.title')}
                            >
                                <thead>
                                    <tr>
                                        <th scope="col">{t('label.sam.probes.name')}</th>
                                        <th scope="col">{t('label.sam.probes.description')}</th>
                                        <th scope="col">{t('label.sam.probes.severity')}</th>
                                        <th scope="col">{t('label.sam.probes.status')}</th>
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
                                            {/* A11y A-002: per-probe status badge with aria-label */}
                                            <td>{renderStatusBadge(probe.status.health, null)}</td>
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
                                    onClick={handleClose}/>
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
