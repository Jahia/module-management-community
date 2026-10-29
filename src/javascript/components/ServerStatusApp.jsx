import React, {useMemo} from 'react';
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

/** A JSON message is shown pretty-printed, and a text message is cut after 50 words. */
const ProbeMessage = ({message}) => {
    let text;
    try {
        text = JSON.stringify(JSON.parse(message), null, 2);
    } catch (_) {
        const words = message.split(/\s+/);
        text = words.length > 50 ? words.slice(0, 50).join(' ') + '...' : message;
    }

    return <Typography variant="caption" className={styles.probeMessage}>{text}</Typography>;
};

ProbeMessage.propTypes = {
    message: PropTypes.string.isRequired
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
                {data.message && <ProbeMessage message={data.message}/>}
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

const SummaryItem = ({label, children}) => (
    <div className={styles.summaryItem}>
        <Typography variant="caption" className={styles.summaryLabel}>{label}</Typography>
        {children}
    </div>
);

SummaryItem.propTypes = {
    label: PropTypes.string.isRequired,
    children: PropTypes.node
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
                <Paper className={styles.summary} data-testid="server-status-summary">
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
                </Paper>
                <Typography variant="heading" component="h2" className={styles.sectionTitle}>
                    {t('label.sam.probes.title')}
                </Typography>
                <Paper hasPadding={false} className={styles.tableWrapper} data-testid="server-status-probes">
                    <div className={styles.filters}>
                        <Typography variant="body">{t('label.sam.severityFilter.label')}</Typography>
                        <Dropdown variant="outlined"
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
                        <Button variant="ghost"
                                icon={<Reload/>}
                                label={t('label.refresh')}
                                isDisabled={loading}
                                data-testid="server-status-refresh"
                                onClick={() => refetch().catch(() => undefined)}/>
                    }
                />
            }
        >
            <main className={styles.content}>{content}</main>
        </LayoutContent>
    );
};

export default ServerStatusApp;
