import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {
    Button,
    DeletePermanently,
    Download,
    Loader,
    Reload,
    Separator,
    Server,
    Switch,
    Table,
    TableBody,
    TableHead,
    TableHeadCell,
    TableRow,
    Typography,
    Upload
} from '@jahia/moonstone';
import styles from './ModuleManagementCommunityApp.scss';
// A11y: MUI Menu/MenuItem give real role="menu"/role="menuitem" semantics,
// Escape-to-close and focus return — none of which the Moonstone Menu provides
// (it renders <menu role="list"> with plain <li> and injects an unlabeled search).
import {Card, CardContent, CardHeader, Divider, Menu, MenuItem, TableSortLabel, Tooltip} from '@material-ui/core';
import dayjs from 'dayjs';

import {getComparator, resolveAllDependentModules} from '../utils/moduleUtils';
import {useModulePreferences} from '../hooks/useModulePreferences';
import ModuleRow from './ModuleRow';
import {ModuleTablePagination} from './ModuleTablePagination';
import {UploadModuleDialog} from './UploadModuleDialog';
import {ExportModulesDialog} from './ExportModulesDialog';
import {DryRunResultDialog} from './DryRunResultDialog';
import {UpdateOptionsPopover} from './UpdateOptionsPopover';
import {GenerateScriptDialog} from './GenerateScriptDialog';
import {InstallFromStoreDialog} from './InstallFromStoreDialog';
import PropTypes from 'prop-types';

// ── GraphQL documents ────────────────────────────────────────────────────────

/** Module types that are "Jahia modules" as opposed to plain OSGi bundles. */
const JAHIA_MODULE_TYPES = ['module', 'system', 'templatesSet'];

/** Aria-sort value for a column header given the active sort column/direction. */
const ariaSortFor = (property, orderBy, order) => {
    if (orderBy !== property) {
        return 'none';
    }

    return order === 'asc' ? 'ascending' : 'descending';
};

/**
 * Predicate factory for the installed-modules table filter. Extracted from the
 * component to keep the render function's cognitive complexity within budget.
 */
const buildModuleFilter = ({updatesOnly, updates, dependentUpdates, typeFilter, bundleTypes, debouncedFilter}) => module => {
    if (updatesOnly &&
        !updates.some(u => u.name === module.name) &&
        !dependentUpdates[module.name]?.length) {
        return false;
    }

    if (typeFilter === 'jahia') {
        const knownType = bundleTypes[module.name];
        if (knownType && !JAHIA_MODULE_TYPES.includes(knownType)) {
            return false;
        }
    } else if (typeFilter) {
        const knownType = bundleTypes[module.name];
        if (knownType && knownType !== typeFilter) {
            return false;
        }
    }

    const needle = debouncedFilter.trim().toLowerCase();
    return needle === '' || module.name.toLowerCase().includes(needle);
};

const INSTALLED_MODULES_QUERY = gql`query {
    admin { modulesManagement { installedModules installedBundleTypes clustered } }
}`;

const AVAILABLE_UPDATES_QUERY = gql`query {
    admin { modulesManagement { availableUpdates lastUpdateTime } }
}`;

const UPDATE_MODULES_MUTATION = gql`mutation (
    $filter: [String], $dryRun: Boolean,
    $autostart: Boolean, $uninstall: Boolean, $onStartup: Boolean
) {
    admin { modulesManagement {
        updateModules(
            jahiaOnly: true, filters: $filter,
            dryRun: $dryRun, autostart: $autostart,
            uninstallPrevious: $uninstall, onStartup: $onStartup
        ) { modules yamlScript }
    }}
}`;

const SYNCHRONIZE_MUTATION = gql`mutation { admin { modulesManagement { synchronizeBundles } } }`;
const PUSH_MUTATION = gql`mutation { admin { modulesManagement { pushBundles } } }`;
const PULL_MUTATION = gql`mutation { admin { modulesManagement { pullBundles } } }`;
const CLEANUP_JCR_MUTATION = gql`mutation { admin { modulesManagement { cleanupJcrVersions } } }`;

// ── SortableHeader ────────────────────────────────────────────────────────────

// A11y CRITICAL-4: real <button> whose accessible name includes the current sort
// direction, so screen-reader users hear e.g. "Module name, sorted ascending".
// The visible label text and the sort icon are preserved; aria-sort stays on the th.
const SortableHeader = ({property, label, order, orderBy, onSort}) => {
    const {t} = useTranslation('module-management-community');
    const isActive = orderBy === property;
    const directionLabel = isActive ?
        (order === 'asc' ?
            t('label.table.sort.ascending', 'sorted ascending') :
            t('label.table.sort.descending', 'sorted descending')) :
        t('label.table.sort.notSorted', 'not sorted, activate to sort ascending');

    return (
        <button
            type="button"
            className={styles.sortableHeaderBtn}
            aria-label={`${label}, ${directionLabel}`}
            onClick={() => onSort(property)}
        >
            <Typography variant="body" weight="semiBold" aria-hidden="true">{label}</Typography>
            <TableSortLabel
                component="span"
                active={isActive}
                classes={{icon: isActive ? styles.iconActive : styles.icon}}
                direction={isActive ? order : 'asc'}
                aria-hidden="true"
                tabIndex={-1}
            />
        </button>
    );
};

SortableHeader.propTypes = {
    property: PropTypes.string,
    label: PropTypes.string,
    order: PropTypes.string,
    orderBy: PropTypes.string,
    onSort: PropTypes.func
};

// ── Cluster menu items ──────────────────────────────────────────────────────

// Cluster operations sub-menu. Returns a flat *array* of elements (not a
// component) so they become direct children of the MUI <Menu> — MUI's MenuList
// manages roving focus per child, and a wrapper component would hide them as one.
const buildClusterMenuItems = ({isClustered, t, onOperation}) => {
    if (!isClustered) {
        return [];
    }

    const operations = [
        {key: 'synchronize', labelKey: 'label.table.actions.sync', Icon: Reload},
        {key: 'push', labelKey: 'label.table.actions.push', Icon: Upload},
        {key: 'pull', labelKey: 'label.table.actions.pull', Icon: Download}
    ];

    return [
        <Divider key="cluster-divider"/>,
        <MenuItem key="cluster-title" disabled className={styles.menuSectionHeader}>
            <span className={styles.menuItemContent}><Server aria-hidden="true"/>{t('label.cluster.ops.title')}</span>
        </MenuItem>,
        ...operations.map(({key, labelKey, Icon}) => (
            <MenuItem key={key} onClick={() => onOperation(key)}>
                <span className={styles.menuItemContent}><Icon aria-hidden="true"/>{t(labelKey)}</span>
            </MenuItem>
        ))
    ];
};

// ── Main component ────────────────────────────────────────────────────────────

const ModuleManagementCommunityApp = () => {
    const notificationContext = useNotifications();
    const {t} = useTranslation('module-management-community');
    const [preferences, setPreferences] = useModulePreferences();

    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('name');
    const [updates, setUpdates] = useState([]);
    const [modules, setModules] = useState([]);
    const [filter, setFilter] = useState('');
    const [debouncedFilter, setDebouncedFilter] = useState('');
    // Default: show only Jahia module types (module / system / templatesSet).
    // The special value 'jahia' means "all Jahia module types"; '' means truly all (includes bundles).
    const [typeFilter, setTypeFilter] = useState('jahia');
    const [bundleTypes, setBundleTypes] = useState({});
    const [dependentUpdates, setDependentUpdates] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [isGenerateScriptOpen, setIsGenerateScriptOpen] = useState(false);
    const [isInstallFromStoreOpen, setIsInstallFromStoreOpen] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [dryRunResult, setDryRunResult] = useState(null);

    // ── Queries ────────────────────────────────────────────────────────────────

    const {
        data: initialData, error: initialError, loading: initialLoading,
        refetch: refreshAllModules
    } = useQuery(INSTALLED_MODULES_QUERY, {
        fetchPolicy: 'cache-and-network',
        // A11y B-005: only poll when user has auto-refresh enabled
        pollInterval: preferences.autoRefresh ? 30000 : 0,
        initialFetchPolicy: 'network-only'
    });

    const {data, error, loading, refetch} = useQuery(AVAILABLE_UPDATES_QUERY, {
        fetchPolicy: 'cache-and-network', initialFetchPolicy: 'standby'
    });

    // ── Mutations ──────────────────────────────────────────────────────────────

    const [updateAll] = useMutation(UPDATE_MODULES_MUTATION, {
        variables: {
            filter: [],
            dryRun: preferences.dryRun,
            autostart: preferences.autostart,
            uninstall: preferences.uninstallPrevious,
            onStartup: preferences.onStartup
        }
    });
    const [synchronize] = useMutation(SYNCHRONIZE_MUTATION);
    const [push] = useMutation(PUSH_MUTATION);
    const [pull] = useMutation(PULL_MUTATION);
    const [cleanupJcr] = useMutation(CLEANUP_JCR_MUTATION);

    // ── Effects ────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (data?.admin?.modulesManagement?.availableUpdates) {
            setUpdates(data.admin.modulesManagement.availableUpdates.map(m => ({
                name: m.substring(0, m.indexOf('/')).trim(),
                version: m.substring(m.indexOf('/') + 1, m.indexOf(':')).trim(),
                available: m.substring(m.indexOf(':') + 1).trim()
            })));
        }
    }, [data]);

    useEffect(() => {
        if (initialData?.admin?.modulesManagement?.installedModules) {
            const installedModules = initialData.admin.modulesManagement.installedModules
                .filter(m => m && m.includes('/') && m.includes(':'))
                .map(m => ({
                    name: m.substring(0, m.indexOf('/')).trim(),
                    version: m.substring(m.indexOf('/') + 1, m.indexOf(':')).trim(),
                    state: m.substring(m.indexOf(':') + 1).trim(),
                    available: updates.find(u => u.name === m.substring(0, m.indexOf('/')).trim())?.available || ''
                }));
            installedModules.sort(getComparator(order, orderBy));
            setModules(installedModules);
        }
    }, [initialData, order, orderBy, updates]);

    useEffect(() => {
        if (initialData?.admin?.modulesManagement?.installedBundleTypes) {
            const typeMap = {};
            initialData.admin.modulesManagement.installedBundleTypes.forEach(entry => {
                const colonIdx = entry.indexOf(':');
                if (colonIdx > 0) {
                    typeMap[entry.substring(0, colonIdx)] = entry.substring(colonIdx + 1);
                }
            });
            setBundleTypes(typeMap);
        }
    }, [initialData]);

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedFilter, preferences.updatesOnly]);
    useEffect(() => {
        const timerId = setTimeout(() => setDebouncedFilter(filter), 300);
        return () => clearTimeout(timerId);
    }, [filter]);

    // ── Handlers ───────────────────────────────────────────────────────────────

    const sortedModules = useMemo(() => [...modules].sort(getComparator(order, orderBy)), [modules, order, orderBy]);

    const handleSort = useCallback(property => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    }, [order, orderBy]);

    const handleDependentUpdate = useCallback((moduleName, deps) => {
        setDependentUpdates(prev => ({...prev, [moduleName]: Array.isArray(deps) ? deps : [deps]}));
    }, []);

    const handleReportType = useCallback((moduleName, type) => {
        setBundleTypes(prev => prev[moduleName] === type ? prev : {...prev, [moduleName]: type});
    }, []);

    const handleUpdateAll = async filterArg => {
        try {
            let expandedFilter = [];
            if (filterArg && filterArg.length > 0) {
                const filterArr = Array.isArray(filterArg) ? filterArg : [filterArg];
                filterArr.forEach(m => {
                    resolveAllDependentModules(m, dependentUpdates, updates).forEach(d => expandedFilter.push(d));
                });
                expandedFilter = Array.from(new Set(expandedFilter)).sort();
            }

            const result = await updateAll({
                variables: {
                    filter: expandedFilter, jahiaOnly: preferences.jahiaOnly,
                    dryRun: preferences.dryRun, autostart: preferences.autostart,
                    uninstall: preferences.uninstallPrevious, onStartup: preferences.onStartup
                }
            });

            const updateResult = result?.data?.admin?.modulesManagement?.updateModules;
            const updatedModules = updateResult?.modules ?? [];
            const yamlScript = updateResult?.yamlScript;

            if (preferences.dryRun && yamlScript) {
                setDryRunResult({modules: Array.from(updatedModules), yamlScript});
            } else {
                notificationContext.notify(
                    expandedFilter.length > 0 ?
                        t('label.updateAllSuccessWithFilter', {modules: expandedFilter.join(', ')}) :
                        t('label.updateAllSuccess'),
                    ['closeButton', 'closeAfter5s']
                );
                await refetch();
            }
        } catch (e) {
            console.error('Error updating modules:', e);
            notificationContext.notify(t('label.updateAllError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleClusterOperation = async operation => {
        try {
            if (operation === 'synchronize') {
                await synchronize();
            } else if (operation === 'push') {
                await push();
            } else if (operation === 'pull') {
                await pull();
            }

            notificationContext.notify(t(`label.${operation}BundlesSuccess`), ['closeButton', 'closeAfter5s']);
            await refetch();
        } catch (e) {
            console.error(`Error during ${operation}:`, e);
            notificationContext.notify(t(`label.${operation}BundlesError`), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleCleanupJcr = async () => {
        setMenuAnchor(null);
        notificationContext.notify(t('label.cleanup.running'), ['closeButton']);
        try {
            const result = await cleanupJcr();
            const msg = result?.data?.admin?.modulesManagement?.cleanupJcrVersions || t('label.cleanup.success');
            notificationContext.notify(msg, ['closeButton', 'closeAfter5s']);
        } catch (e) {
            console.error('Error cleaning up JCR versions:', e);
            notificationContext.notify(t('label.cleanup.error'), ['closeButton', 'closeAfter5s']);
        }
    };

    // ── Loading / error states ─────────────────────────────────────────────────

    if (error || initialError) {
        notificationContext.notify(t('label.errors.loadingVanityUrl'), ['closeButton', 'closeAfter5s']);
        return <>{t('label.errors.generic')}</>;
    }

    if (initialLoading || loading) {
        return (
            <Card>
                <CardHeader title={
                    <Typography className={styles.title} variant="heading" weight="semiBold" component="h2">
                        {t('label.table.title')}
                    </Typography>
                }/>
                {/* A11y A-010: announce loading state to screen readers */}
                <CardContent className={styles.flexCenter}>
                    <div className={styles.flex} role="status" aria-label={t('label.loading', 'Loading')}>
                        <Loader size="big"/>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // ── Filtered / paginated slice ─────────────────────────────────────────────

    const filteredModules = sortedModules.filter(buildModuleFilter({
        updatesOnly: preferences.updatesOnly,
        updates,
        dependentUpdates,
        typeFilter,
        bundleTypes,
        debouncedFilter
    }));

    const isClustered = initialData.admin.modulesManagement.clustered;
    const lastUpdate = dayjs(data.admin.modulesManagement.lastUpdateTime).format('DD/MM/YYYY HH:mm');
    const pageSlice = filteredModules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <Card elevation={4}>
            <CardHeader
                title={
                    <Typography className={styles.title} variant="heading" weight="semiBold" component="h2">
                        {t('label.table.title')}
                    </Typography>
                }
                action={
                    <div className={styles.actionGroup}>

                        <UpdateOptionsPopover preferences={preferences} onPreferencesChange={setPreferences}/>

                        <Tooltip title={t('label.lastUpdate', {date: lastUpdate})} placement="bottom">
                            <span>
                                <Button variant="outlined"
                                        size="big"
                                        color="accent"
                                        label={t('label.refresh')}
                                        icon={<Reload/>}
                                        className={styles.button}
                                        onClick={() => {
                                            notificationContext.notify(t('label.fetchUpdates'), ['closeButton', 'closeAfter5s']);
                                            refetch();
                                        }}/>
                            </span>
                        </Tooltip>

                        {/* A11y B-005: user-controllable auto-refresh toggle */}
                        <Tooltip
                            title={preferences.autoRefresh ?
                                t('label.autoRefresh.disable', 'Disable auto-refresh (currently refreshes every 30 s)') :
                                t('label.autoRefresh.enable', 'Enable auto-refresh every 30 s')}
                            placement="bottom"
                        >
                            <span>
                                <Button variant={preferences.autoRefresh ? 'outlined' : 'ghost'}
                                        size="big"
                                        color={preferences.autoRefresh ? 'accent' : 'default'}
                                        label={preferences.autoRefresh ?
                                            t('label.autoRefresh.on', 'Auto') :
                                            t('label.autoRefresh.off', 'Auto')}
                                        aria-pressed={preferences.autoRefresh}
                                        className={styles.button}
                                        onClick={() => setPreferences({
                                            ...preferences,
                                            autoRefresh: !preferences.autoRefresh
                                        })}/>
                            </span>
                        </Tooltip>

                        <Tooltip
                            title={preferences.dryRun ? t('label.updateAllDryRunTooltip') : t('label.updateAllLiveTooltip')}
                            placement="bottom"
                        >
                            <span>
                                <Button variant="outlined"
                                        size="big"
                                        color={preferences.dryRun ? 'accent' : 'danger'}
                                        label={`${t('label.updateAll')} (${preferences.dryRun ? t('label.updateAllBadgeDry') : t('label.updateAllBadgeLive')})`}
                                        icon={<Upload/>}
                                        isDisabled={updates.length === 0}
                                        className={styles.button}
                                        data-testid="update-all-btn"
                                        onClick={() => handleUpdateAll([])}/>
                            </span>
                        </Tooltip>

                        {/* A11y A-014: aria-label, aria-haspopup, aria-expanded, aria-controls on ⋮ menu */}
                        <button className={styles.dotMenuBtn}
                                id="more-actions-trigger"
                                type="button"
                                aria-label={t('label.menu.title')}
                                aria-haspopup="true"
                                aria-expanded={Boolean(menuAnchor)}
                                aria-controls={menuAnchor ? 'more-actions-menu' : undefined}
                                data-testid="more-actions-btn"
                                onClick={e => setMenuAnchor(e.currentTarget)}
                        >
                            <span aria-hidden="true">⋮</span>
                        </button>
                        <Menu id="more-actions-menu"
                              anchorEl={menuAnchor}
                              open={Boolean(menuAnchor)}
                              anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                              getContentAnchorEl={null}
                              transformOrigin={{vertical: 'top', horizontal: 'right'}}
                              MenuListProps={{'aria-label': t('label.menu.title')}}
                              onClose={() => setMenuAnchor(null)}
                        >
                            <MenuItem onClick={() => {
                                setMenuAnchor(null);
                                setIsUploadOpen(true);
                            }}
                            >
                                <span className={styles.menuItemContent}><Upload aria-hidden="true"/>{t('label.upload.deploy')}</span>
                            </MenuItem>
                            <MenuItem onClick={() => {
                                setMenuAnchor(null);
                                setIsExportOpen(true);
                            }}
                            >
                                <span className={styles.menuItemContent}><Download aria-hidden="true"/>{t('label.export.snapshot')}</span>
                            </MenuItem>
                            <MenuItem onClick={() => {
                                setMenuAnchor(null);
                                setIsGenerateScriptOpen(true);
                            }}
                            >
                                <span className={styles.menuItemContent}><Download aria-hidden="true"/>{t('label.generateScript.menuItem')}</span>
                            </MenuItem>
                            <MenuItem onClick={() => {
                                setMenuAnchor(null);
                                setIsInstallFromStoreOpen(true);
                            }}
                            >
                                <span className={styles.menuItemContent}><Upload aria-hidden="true"/>{t('label.installFromStore.menuItem')}</span>
                            </MenuItem>
                            <Divider/>
                            <MenuItem onClick={handleCleanupJcr}>
                                <span className={styles.menuItemContent}><DeletePermanently aria-hidden="true"/>{t('label.cleanup.jcr')}</span>
                            </MenuItem>
                            {buildClusterMenuItems({
                                isClustered,
                                t,
                                onOperation: operation => {
                                    setMenuAnchor(null);
                                    handleClusterOperation(operation);
                                }
                            })}
                            <Divider/>
                            <MenuItem disabled>
                                <span className={styles.menuItemContent}>{t('label.lastUpdate', {date: lastUpdate})}</span>
                            </MenuItem>
                        </Menu>
                    </div>
                }
                classes={{action: styles.action, title: styles.titleWrapper}}
            />

            <CardContent className={styles.marginBorder}>
                <Separator variant="horizontal" spacing="none"/>
                {/* A11y A-017 / 1.3.1: explicit ARIA roles restore table semantics that
                    Moonstone's `display:flex/block` styling strips from the native <table>. */}
                <Table aria-label={t('label.table.title')} role="table">
                    <TableHead role="rowgroup">
                        <TableRow className={styles.tableRow} role="row">
                            <TableHeadCell
                                role="columnheader"
                                scope="col"
                                aria-sort={ariaSortFor('name', orderBy, order)}
                            >
                                <div className={styles.columnHeaderCell}>
                                    <div className={styles.columnHeaderRow}>
                                        <SortableHeader property="name"
                                                        label={t('label.table.cells.name')}
                                                        order={order}
                                                        orderBy={orderBy}
                                                        onSort={handleSort}/>
                                    </div>
                                    {/* A11y A-005: visually-hidden label for name filter */}
                                    <label htmlFor="filter-name" className={styles.srOnly}>
                                        {t('label.input.filterBySymbolicName')}
                                    </label>
                                    <input id="filter-name"
                                           type="text"
                                           placeholder={t('label.input.filterBySymbolicName')}
                                           value={filter}
                                           className={styles.columnFilterInput}
                                           aria-label={t('label.input.filterBySymbolicName')}
                                           onChange={e => setFilter(e.target.value)}/>
                                </div>
                            </TableHeadCell>

                            <TableHeadCell role="columnheader" scope="col">
                                <div className={styles.columnHeaderCell}>
                                    <div className={styles.columnHeaderRow}>
                                        <Typography variant="body"
                                                    weight="semiBold"
                                        >{t('label.table.cells.type')}
                                        </Typography>
                                    </div>
                                    {/* A11y A-022: aria-label on type filter select */}
                                    <select value={typeFilter}
                                            className={styles.columnFilterInput}
                                            aria-label={t('label.table.cells.type')}
                                            style={{marginTop: '6px', marginBottom: '8px'}}
                                            onChange={e => {
                                                setTypeFilter(e.target.value);
                                                setCurrentPage(1);
                                            }}
                                    >
                                        <option value="jahia">{t('label.input.filterByType.jahia')}</option>
                                        <option value="">{t('label.input.filterByType.all')}</option>
                                        <option value="module">module</option>
                                        <option value="system">system</option>
                                        <option value="bundle">bundle</option>
                                        <option value="templatesSet">templatesSet</option>
                                    </select>
                                </div>
                            </TableHeadCell>

                            <TableHeadCell
                                role="columnheader"
                                scope="col"
                                aria-sort={ariaSortFor('version', orderBy, order)}
                            >
                                <SortableHeader property="version"
                                                label={t('label.table.cells.version')}
                                                order={order}
                                                orderBy={orderBy}
                                                onSort={handleSort}/>
                            </TableHeadCell>

                            {updates.length > 0 && (
                                <TableHeadCell
                                    role="columnheader"
                                    scope="col"
                                    aria-sort={ariaSortFor('available', orderBy, order)}
                                >
                                    <div className={styles.columnHeaderCell}>
                                        <div className={styles.columnHeaderRow}>
                                            <SortableHeader property="available"
                                                            label={t('label.table.cells.available')}
                                                            order={order}
                                                            orderBy={orderBy}
                                                            onSort={handleSort}/>
                                        </div>
                                        {/* A11y A-021: aria-label on updates-only switch */}
                                        <label className={styles.columnCheckboxLabel}>
                                            <Switch checked={preferences.updatesOnly}
                                                    aria-label={t('label.input.updatesOnly')}
                                                    onChange={(e, value, checked) => setPreferences({
                                                         ...preferences,
                                                         updatesOnly: checked
                                                     })}/>
                                            <Typography variant="caption" aria-hidden="true">{t('label.input.updatesOnly')}</Typography>
                                        </label>
                                    </div>
                                </TableHeadCell>
                            )}

                            <TableHeadCell
                                role="columnheader"
                                scope="col"
                                aria-sort={ariaSortFor('state', orderBy, order)}
                            >
                                <SortableHeader property="state"
                                                label={isClustered ? t('label.table.cells.clusterstate') : t('label.table.cells.state')}
                                                order={order}
                                                orderBy={orderBy}
                                                onSort={handleSort}/>
                            </TableHeadCell>

                            {isClustered && (
                                <TableHeadCell role="columnheader" scope="col">
                                    <Typography variant="body" weight="semiBold">
                                        {t('label.table.cells.cluster.nodes.state')}
                                    </Typography>
                                </TableHeadCell>
                            )}

                            <TableHeadCell role="columnheader" scope="col">
                                <Typography variant="body"
                                            weight="semiBold"
                                >{t('label.table.actions.title')}
                                </Typography>
                            </TableHeadCell>
                        </TableRow>
                    </TableHead>
                    <TableBody role="rowgroup">
                        {pageSlice.map(module => (
                            <ModuleRow key={`${module.name}-${module.version}`}
                                       module={module}
                                       updates={updates}
                                       handleUpdate={handleUpdateAll}
                                       dependentUpdates={handleDependentUpdate}
                                       reportType={handleReportType}
                                       isClustered={isClustered}
                                       refreshAllModules={refreshAllModules}/>
                        ))}
                    </TableBody>
                </Table>
                <Separator variant="horizontal" spacing="none"/>

                <ModuleTablePagination
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    totalItems={filteredModules.length}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                />
            </CardContent>

            <UploadModuleDialog isOpen={isUploadOpen}
                                onClose={() => setIsUploadOpen(false)}
                                onDeploySuccess={() => {
                                    setIsUploadOpen(false);
                                    notificationContext.notify(t('label.upload.deploySuccess'), ['closeButton', 'closeAfter5s']);
                                    refreshAllModules();
                                    refetch(); // Re-check available updates for the newly deployed module
                                }}/>
            <ExportModulesDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)}/>
            <GenerateScriptDialog
                isOpen={isGenerateScriptOpen}
                modules={modules}
                bundleTypes={bundleTypes}
                onClose={() => setIsGenerateScriptOpen(false)}
            />
            <DryRunResultDialog isOpen={Boolean(dryRunResult)}
                                modules={dryRunResult?.modules}
                                yamlScript={dryRunResult?.yamlScript}
                                onClose={() => setDryRunResult(null)}/>
            <InstallFromStoreDialog
                isOpen={isInstallFromStoreOpen}
                onClose={() => setIsInstallFromStoreOpen(false)}
                onInstallSuccess={() => {
                    setIsInstallFromStoreOpen(false);
                    notificationContext.notify(t('label.installFromStore.successNotification'), ['closeButton', 'closeAfter5s']);
                    refreshAllModules();
                    refetch();
                }}
            />
        </Card>
    );
};

export {getComparator};
export default ModuleManagementCommunityApp;
