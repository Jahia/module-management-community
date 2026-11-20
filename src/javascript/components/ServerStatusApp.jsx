import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {
    Banner,
    Button,
    Cancel,
    Check,
    Chip,
    DataTable,
    Dropdown,
    EmptyData,
    Header,
    LayoutContent,
    Paper,
    Reload,
    Switch,
    Typography,
    Warning
} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import dayjs from 'dayjs';
import {useModulePreferences} from '../hooks/useModulePreferences';
import styles from './ServerStatusApp.scss';

const SERVER_STATUS_QUERY = gql`
    query GetServerStatus($severity: GqlProbeSeverity) {
        admin {
            jahia {
                version { release buildDate build }
                healthCheck(severity: $severity) {
                    status { health }
                    probes {
                        name description severity
                        status { health message }
                    }
                }
            }
        }
    }`;

const SEVERITY_ORDER = {CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4, DEBUG: 5};

// The healthCheck field returns the probes of the given severity and above.
const SEVERITY_FILTERS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'DEBUG'];
const STATUS_ORDER = {RED: 1, YELLOW: 2, GREEN: 3};

const HEALTH_CHIP = {
    GREEN: {color: 'success', Icon: Check, labelKey: 'label.sam.health.green'},
    YELLOW: {color: 'warning', Icon: Warning, labelKey: 'label.sam.health.yellow'},
    RED: {color: 'danger', Icon: Cancel, labelKey: 'label.sam.health.red'}
};

const compareProbes = (a, b) =>
    (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) ||
    (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) ||
    a.name.localeCompare(b.name);

const HealthChip = ({health}) => {
    const {t} = useTranslation('module-management-community');
    const {color, Icon, labelKey} = HEALTH_CHIP[health] || HEALTH_CHIP.RED;
    return <Chip color={color} icon={<Icon/>} label={t(labelKey)}/>;
};

HealthChip.propTypes = {
    health: PropTypes.string
};

let idCounter = 0;
const useStableId = prefix => {
    const ref = useRef(null);
    if (ref.current === null) {
        ref.current = `${prefix}-${++idCounter}`;
    }

    return ref.current;
};

/**
 * A JSON message is shown pretty-printed, and a text message is cut after 50 words.
 * A11y 2.1.1: when the message box scrolls, it is a named region that takes focus, so the keyboard can scroll it.
 */
const ProbeMessage = ({message, probeName}) => {
    const {t} = useTranslation('module-management-community');
    const boxRef = useRef(null);
    const [isScrollable, setScrollable] = useState(false);
    let text;
    try {
        text = JSON.stringify(JSON.parse(message), null, 2);
    } catch (_) {
        const words = message.split(/\s+/);
        text = words.length > 50 ? words.slice(0, 50).join(' ') + '...' : message;
    }

    useLayoutEffect(() => {
        const box = boxRef.current;
        if (box) {
            setScrollable(box.scrollHeight > box.clientHeight);
        }
    }, [text]);

    return (
        <div ref={boxRef}
             className={styles.probeMessage}
             {...(isScrollable ? {
                 role: 'region',
                 tabIndex: 0,
                 'aria-label': t('label.sam.probes.messageRegion', {name: probeName})
             } : {})}
        >
            <Typography variant="caption" className={styles.probeMessageText}>{text}</Typography>
        </div>
    );
};

ProbeMessage.propTypes = {
    message: PropTypes.string.isRequired,
    probeName: PropTypes.string.isRequired
};

const buildProbeColumns = t => [
    {
        key: 'name',
        label: t('label.sam.probes.name'),
        isSortable: true,
        width: '240px',
        render: ({value}) => <Typography variant="body">{value}</Typography>
    },
    {
        key: 'description',
        label: t('label.sam.probes.description'),
        render: ({data}) => (
            <div className={styles.probeInfo}>
                <Typography variant="body">{data.description || t('label.sam.probes.noDescription')}</Typography>
                {data.message && <ProbeMessage message={data.message} probeName={data.name}/>}
            </div>
        )
    },
    {
        key: 'severity',
        label: t('label.sam.probes.severity'),
        isSortable: true,
        width: '120px',
        sortFn: (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
        render: ({value}) => (
            <Typography variant="body">{t(`label.sam.severity.${value.toLowerCase()}`, {defaultValue: value})}</Typography>
        )
    },
    {
        key: 'status',
        label: t('label.sam.probes.status'),
        isSortable: true,
        width: '140px',
        sortFn: (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
        render: ({value}) => <HealthChip health={value}/>
    }
];

// A11y 1.3.1: the summary is a description list, so each value is tied to its label.
const SummaryItem = ({label, children}) => (
    <div className={styles.summaryItem}>
        <Typography variant="caption" component="dt" className={styles.summaryLabel}>{label}</Typography>
        <dd className={styles.summaryValue}>{children}</dd>
    </div>
);

SummaryItem.propTypes = {
    label: PropTypes.string.isRequired,
    children: PropTypes.node
};

/**
 * The Moonstone Dropdown names its listbox with the selected value and forwards no aria prop to it,
 * so the listbox gets its name here: the visible "Severity" label, then its own value.
 */
const SeverityDropdown = ({label, ...props}) => {
    const wrapperRef = useRef(null);
    const labelId = useStableId('server-status-severity-label');
    const listboxId = useStableId('server-status-severity');

    useEffect(() => {
        const listbox = wrapperRef.current?.querySelector('[role="listbox"]');
        if (listbox) {
            listbox.id = listboxId;
            listbox.setAttribute('aria-labelledby', `${labelId} ${listboxId}`);
        }
    });

    return (
        <div ref={wrapperRef} className={styles.severity}>
            <Typography variant="body" component="span" id={labelId}>{label}</Typography>
            <Dropdown {...props}/>
        </div>
    );
};

SeverityDropdown.propTypes = {
    label: PropTypes.string.isRequired
};

/** The text of a polite status region that speaks only when the text changes after the first result. */
const useAnnouncement = text => {
    const [announcement, setAnnouncement] = useState('');
    const lastRef = useRef(null);

    useEffect(() => {
        if (!text) {
            return;
        }

        if (lastRef.current !== null && lastRef.current !== text) {
            setAnnouncement(text);
        }

        lastRef.current = text;
    }, [text]);

    return announcement;
};

export const ServerStatusApp = () => {
    const {t} = useTranslation('module-management-community');
    // A11y HIGH-8 (WCAG 2.2.4): only poll when the user has enabled auto-refresh
    const [preferences, setPreferences] = useModulePreferences();
    const severity = preferences.probeSeverity;
    const {data: currentData, previousData, error, loading, refetch} = useQuery(SERVER_STATUS_QUERY, {
        variables: {severity},
        fetchPolicy: 'network-only',
        notifyOnNetworkStatusChange: true,
        pollInterval: preferences.autoRefresh ? 30000 : 0
    });
    // The previous result stays on screen while the probes of another severity load.
    const data = currentData || previousData;
    const severityOptions = useMemo(() => SEVERITY_FILTERS.map(value => ({
        value,
        label: t(`label.sam.severityFilter.${value.toLowerCase()}`)
    })), [t]);

    const jahia = data?.admin?.jahia;
    const version = jahia?.version;
    const probes = useMemo(() => (jahia?.healthCheck?.probes || [])
        .map(probe => ({
            name: probe.name,
            description: probe.description || '',
            message: probe.status.message || '',
            severity: probe.severity,
            status: probe.status.health
        }))
        .sort(compareProbes), [jahia]);
    const columns = useMemo(() => buildProbeColumns(t), [t]);
    const health = jahia?.healthCheck?.status?.health;
    const announcement = useAnnouncement(health ? t('label.sam.announce', {
        health: t((HEALTH_CHIP[health] || HEALTH_CHIP.RED).labelKey),
        count: probes.length
    }) : '');

    // A11y 2.4.3: the button stays enabled while loading, so focus stays on it; a click then does nothing.
    const handleRefresh = useCallback(() => {
        if (!loading) {
            refetch().catch(() => undefined);
        }
    }, [loading, refetch]);

    let content;
    if (error) {
        content = (
            <Banner variant="danger" title={t('label.sam.errorStatus')} role="alert">
                {error.message}
            </Banner>
        );
    } else if (jahia) {
        content = (
            <>
                <Paper hasPadding={false} data-testid="server-status-summary">
                    <dl className={styles.summary}>
                        <SummaryItem label={t('label.sam.status')}>
                            <HealthChip health={jahia.healthCheck?.status?.health}/>
                        </SummaryItem>
                        <SummaryItem label={t('label.sam.versionLabel')}>
                            <Typography variant="body">{version?.release}</Typography>
                        </SummaryItem>
                        {version?.buildDate && (
                            <SummaryItem label={t('label.sam.buildDateLabel')}>
                                <Typography variant="body">{dayjs(version.buildDate).format('YYYY-MM-DD')}</Typography>
                            </SummaryItem>
                        )}
                        <SummaryItem label={t('label.sam.buildNumberLabel')}>
                            <Typography variant="body">{version?.build}</Typography>
                        </SummaryItem>
                    </dl>
                </Paper>
                <Typography variant="heading" component="h2" className={styles.sectionTitle}>
                    {t('label.sam.probes.title')}
                </Typography>
                <Paper hasPadding={false} className={styles.tableWrapper} data-testid="server-status-probes">
                    <div className={styles.filters}>
                        <SeverityDropdown label={t('label.sam.severityFilter.label')}
                                          variant="outlined"
                                          data={severityOptions}
                                          value={severity}
                                          data-testid="server-status-severity"
                                          onChange={(event, item) => setPreferences({...preferences, probeSeverity: item.value})}/>
                    </div>
                    {probes.length === 0 ? (
                        <EmptyData message={t('label.sam.probes.none')}/>
                    ) : (
                        <DataTable
                            enableSorting
                            primaryKey="name"
                            enablePagination={false}
                            data={probes}
                            columns={columns}
                            aria-label={t('label.sam.probes.title')}
                        />
                    )}
                </Paper>
            </>
        );
    }

    return (
        <LayoutContent
            hasPadding
            isLoading={loading && !data && !error}
            header={
                <Header
                    title={t('label.serverStatus.title')}
                    toolbarLeft={
                        <div className={styles.toolbar}>
                            <Button variant="ghost"
                                    icon={<Reload/>}
                                    label={t('label.refresh')}
                                    aria-busy={loading}
                                    data-testid="server-status-refresh"
                                    onClick={handleRefresh}/>
                            {/* A11y 2.2.2: the auto-refresh preference, shared with the Modules screen and the nav icon */}
                            <label className={styles.autoRefresh}>
                                <Switch checked={Boolean(preferences.autoRefresh)}
                                        data-testid="server-status-auto-refresh"
                                        onChange={(e, value, checked) => setPreferences({...preferences, autoRefresh: checked})}/>
                                <Typography variant="body" component="span">{t('label.autoRefresh.menu')}</Typography>
                            </label>
                        </div>
                    }
                />
            }
        >
            <div className={styles.content}>
                <div role="status" className={styles.srOnly} data-testid="server-status-announcement">{announcement}</div>
                {content}
            </div>
        </LayoutContent>
    );
};

export default ServerStatusApp;
