import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useApolloClient, useMutation, useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {Banner, Button, DataTable, EmptyData, Header, Help, LayoutContent, Paper} from '@jahia/moonstone';
import dayjs from 'dayjs';
import styles from './ModuleManagementCommunityApp.scss';
import {getComparator, resolveAllDependentModules} from '../utils/moduleUtils';
import {buildModuleFilter, DEFAULT_FILTERS, isDefaultFilters, toStateName} from '../utils/moduleFilters';
import {useModulePreferences} from '../hooks/useModulePreferences';
import {BUNDLE_ROW_QUERY} from '../hooks/useBundleRow';
import {useDataTableA11y} from '../hooks/useDataTableA11y';
import {useAnnounce} from './StatusAnnouncer';
import {buildModuleColumns} from './moduleColumns';
import {ModulesActionBar} from './ModulesActionBar';
import {ModuleFilters} from './filters/ModuleFilters';
import {UploadModuleDialog} from './UploadModuleDialog';
import {ExportModulesDialog} from './ExportModulesDialog';
import {DryRunResultDialog} from './DryRunResultDialog';
import {GenerateScriptDialog} from './GenerateScriptDialog';
import {InstallFromStoreDialog} from './InstallFromStoreDialog';
import {TABLE_HEADING_ID} from './ids';

// ── GraphQL documents ────────────────────────────────────────────────────────

const INSTALLED_MODULES_QUERY = gql`query InstalledModules {
    admin { modulesManagement { installedModules installedBundleTypes clustered } }
}`;

const AVAILABLE_UPDATES_QUERY = gql`query AvailableUpdates {
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

const ITEMS_PER_PAGE_OPTIONS = [20, 50, 100, 200];
const DEFAULT_ITEMS_PER_PAGE = 100;
// The result count waits for the user to stop typing in the name filter, so it is read once.
const COUNT_STATUS_DELAY = 750;

/** Splits an entry of the form "name/version:value" into its three parts. */
const parseEntry = entry => ({
    name: entry.substring(0, entry.indexOf('/')).trim(),
    version: entry.substring(entry.indexOf('/') + 1, entry.indexOf(':')).trim(),
    value: entry.substring(entry.indexOf(':') + 1).trim()
});

/** Maps "symbolicName:type" entries to {symbolicName: type}. */
const parseBundleTypes = entries => Object.fromEntries((entries || [])
    .map(entry => [entry.substring(0, entry.indexOf(':')), entry.substring(entry.indexOf(':') + 1)])
    .filter(([name]) => name));

// ── Main component ────────────────────────────────────────────────────────────

const ModuleManagementCommunityApp = () => {
    const notificationContext = useNotifications();
    const announce = useAnnounce();
    const {t} = useTranslation('module-management-community');
    const tableRef = useRef(null);
    const client = useApolloClient();
    const [preferences, setPreferences] = useModulePreferences();

    const [sortBy, setSortBy] = useState('name');
    const [sortDirection, setSortDirection] = useState('ascending');
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [dependentUpdates, setDependentUpdates] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(DEFAULT_ITEMS_PER_PAGE);
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [isGenerateScriptOpen, setIsGenerateScriptOpen] = useState(false);
    const [isInstallFromStoreOpen, setIsInstallFromStoreOpen] = useState(false);
    const [dryRunResult, setDryRunResult] = useState(null);

    // ── Queries ────────────────────────────────────────────────────────────────

    const {
        data: installedData, error: installedError, loading: installedLoading,
        refetch: refreshAllModules
    } = useQuery(INSTALLED_MODULES_QUERY, {
        fetchPolicy: 'cache-and-network',
        notifyOnNetworkStatusChange: true,
        // A11y B-005: only poll when user has auto-refresh enabled
        pollInterval: preferences.autoRefresh ? 30000 : 0
    });

    const {data: updatesData, error: updatesError, loading: updatesLoading, refetch: refetchUpdates} = useQuery(AVAILABLE_UPDATES_QUERY, {
        fetchPolicy: 'cache-and-network',
        notifyOnNetworkStatusChange: true
    });

    // ── Mutations ──────────────────────────────────────────────────────────────

    const [updateAll] = useMutation(UPDATE_MODULES_MUTATION);
    const [synchronize] = useMutation(SYNCHRONIZE_MUTATION);
    const [push] = useMutation(PUSH_MUTATION);
    const [pull] = useMutation(PULL_MUTATION);
    const [cleanupJcr] = useMutation(CLEANUP_JCR_MUTATION);

    // ── Derived data ───────────────────────────────────────────────────────────

    const modulesManagement = installedData?.admin?.modulesManagement;
    const isClustered = Boolean(modulesManagement?.clustered);
    const lastUpdateTime = updatesData?.admin?.modulesManagement?.lastUpdateTime;
    const lastUpdate = lastUpdateTime ? dayjs(lastUpdateTime).format('DD/MM/YYYY HH:mm') : undefined;

    const updates = useMemo(() => (updatesData?.admin?.modulesManagement?.availableUpdates || [])
        .map(parseEntry)
        .map(({name, version, value}) => ({name, version, available: value})), [updatesData]);

    const modules = useMemo(() => {
        const bundleTypes = parseBundleTypes(modulesManagement?.installedBundleTypes);
        return (modulesManagement?.installedModules || [])
            .filter(m => m && m.includes('/') && m.includes(':'))
            .map(parseEntry)
            .map(({name, version, value}) => ({
                id: `${name}/${version}`,
                name,
                version,
                state: toStateName(value),
                type: bundleTypes[name] || 'bundle',
                available: updates.find(u => u.name === name && u.version === version)?.available || '',
                clusterNodes: '',
                actions: ''
            }));
    }, [modulesManagement, updates]);

    const states = useMemo(() => [...new Set(modules.map(m => m.state))].sort(), [modules]);

    const hasUpdate = useCallback(name =>
        updates.some(u => u.name === name) || dependentUpdates[name]?.length > 0, [updates, dependentUpdates]);

    const filteredModules = useMemo(() => modules
        .filter(buildModuleFilter({filters, hasUpdate}))
        .sort(getComparator(sortDirection === 'descending' ? 'desc' : 'asc', sortBy)),
    [modules, filters, hasUpdate, sortBy, sortDirection]);

    const lastPage = Math.max(1, Math.ceil(filteredModules.length / itemsPerPage));
    const page = Math.min(currentPage, lastPage);
    const pageSlice = filteredModules.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    // A refresh or a filter can leave fewer pages than the page on screen, so the table moves to the last page.
    useEffect(() => {
        if (currentPage > lastPage) {
            setCurrentPage(lastPage);
        }
    }, [currentPage, lastPage]);

    // ── Status messages ────────────────────────────────────────────────────────

    // The snackbar shows the message, and the status region reads it.
    const notify = useCallback((message, options) => {
        notificationContext.notify(message, options);
        announce(message);
    }, [notificationContext, announce]);

    const totalCount = filteredModules.length;
    const isFiltered = !isDefaultFilters(filters);
    let countText = '';
    if (!installedData && !installedError) {
        countText = t('label.loading');
    } else if (!installedError) {
        countText = isFiltered ?
            t('label.table.status.matching', {count: totalCount, total: modules.length}) :
            t('label.table.status.total', {total: modules.length});
    }

    const [countStatus, setCountStatus] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setCountStatus(countText), COUNT_STATUS_DELAY);
        return () => clearTimeout(timer);
    }, [countText]);

    useDataTableA11y(tableRef, {
        rowsPerPageId: 'module-management-community-rows-per-page',
        pagerClassName: styles.stickyPagination,
        labels: {
            first: t('label.pagination.firstPage'),
            previous: t('label.pagination.previousPage'),
            next: t('label.pagination.nextPage'),
            last: t('label.pagination.lastPage')
        }
    });

    // ── Handlers ───────────────────────────────────────────────────────────────

    const changeFilter = (key, value) => {
        setFilters(old => ({...old, [key]: value}));
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setFilters(DEFAULT_FILTERS);
        setCurrentPage(1);
    };

    const changeSort = useCallback((key, direction) => {
        setSortBy(key);
        setSortDirection(direction);
        setCurrentPage(1);
    }, []);

    const handleDependentUpdate = useCallback((moduleName, deps) => {
        setDependentUpdates(prev => {
            if ((prev[moduleName] || []).join() === deps.join()) {
                return prev;
            }

            if (deps.length === 0) {
                const {[moduleName]: _removed, ...rest} = prev;
                return rest;
            }

            return {...prev, [moduleName]: deps};
        });
    }, []);

    // Every row reads its bundle from the cache, so a refresh asks Apollo to reload the rows on screen too.
    const refreshRows = useCallback(() => client.refetchQueries({include: [BUNDLE_ROW_QUERY]}), [client]);

    const refreshAll = useCallback(async () => {
        try {
            await Promise.all([refreshAllModules(), refetchUpdates(), refreshRows()]);
        } catch (e) {
            // The error of a refetch reaches the page through useQuery.
            console.error('Error refreshing modules:', e);
        }
    }, [refreshAllModules, refetchUpdates, refreshRows]);

    const handleUpdateAll = useCallback(async filterArg => {
        announce(t('label.status.updating'));
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
                    filter: expandedFilter,
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
                notify(
                    expandedFilter.length > 0 ?
                        t('label.updateAllSuccessWithFilter', {modules: expandedFilter.join(', ')}) :
                        t('label.updateAllSuccess'),
                    ['closeButton', 'closeAfter5s']
                );
                await refreshAll();
            }
        } catch (e) {
            console.error('Error updating modules:', e);
            notify(t('label.updateAllError'), ['closeButton', 'closeAfter5s']);
        }
    }, [dependentUpdates, updates, updateAll, preferences, notify, announce, t, refreshAll]);

    const handleClusterOperation = async operation => {
        const mutations = {synchronize, push, pull};
        announce(t('label.status.running'));
        try {
            await mutations[operation]();
            notify(t(`label.${operation}BundlesSuccess`), ['closeButton', 'closeAfter5s']);
            await refreshAll();
        } catch (e) {
            console.error(`Error during ${operation}:`, e);
            notify(t(`label.${operation}BundlesError`), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleCleanupJcr = async () => {
        notify(t('label.cleanup.running'), ['closeButton']);
        try {
            const result = await cleanupJcr();
            const msg = result?.data?.admin?.modulesManagement?.cleanupJcrVersions || t('label.cleanup.success');
            notify(msg, ['closeButton', 'closeAfter5s']);
        } catch (e) {
            console.error('Error cleaning up JCR versions:', e);
            notify(t('label.cleanup.error'), ['closeButton', 'closeAfter5s']);
        }
    };

    const columns = useMemo(() => buildModuleColumns({
        t,
        updates,
        isClustered,
        sort: {sortBy, sortDirection, onSort: changeSort},
        refreshAllModules,
        onDependentUpdates: handleDependentUpdate,
        onUpdate: handleUpdateAll
    }), [t, updates, isClustered, sortBy, sortDirection, changeSort, refreshAllModules, handleDependentUpdate, handleUpdateAll]);

    // ── Render ─────────────────────────────────────────────────────────────────

    const error = installedError || updatesError;
    const isLoading = installedLoading || updatesLoading;

    let content;
    if (error) {
        content = (
            <Banner variant="danger" title={t('label.errors.loadingModules')} role="alert">
                {error.message}
            </Banner>
        );
    } else if (pageSlice.length === 0) {
        content = !isLoading && (
            <EmptyData message={isFiltered ? t('label.filters.noMatch') : t('label.noModules')} data-testid="modules-empty"/>
        );
    } else {
        content = (
            <Paper ref={tableRef} hasPadding={false} className={styles.tableWrapper} aria-busy={isLoading} data-testid="modules-table">
                <DataTable
                    enableSorting
                    enablePagination
                    primaryKey="id"
                    data={pageSlice}
                    columns={columns}
                    sortBy={sortBy}
                    sortDirection={sortDirection}
                    currentPage={page}
                    itemsPerPage={itemsPerPage}
                    itemsPerPageOptions={ITEMS_PER_PAGE_OPTIONS}
                    totalItems={filteredModules.length}
                    // A row does nothing on its own, so it loses the tab stop that TableRow sets; its controls keep theirs.
                    rowProps={{className: styles.row, tabIndex: undefined}}
                    paginationProps={{className: styles.stickyPagination}}
                    aria-labelledby={TABLE_HEADING_ID}
                    i18n={{
                        itemsPerPage: t('label.pagination.itemsPerPage'),
                        of: t('label.pagination.of')
                    }}
                    onSortChange={changeSort}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={value => {
                        setItemsPerPage(value);
                        setCurrentPage(1);
                    }}
                />
            </Paper>
        );
    }

    return (
        <>
            <LayoutContent
                hasPadding
                className={styles.layout}
                isLoading={!installedData && !error}
                header={
                    <Header
                        title={t('label.title')}
                        mainActions={
                            /* A11y B-011: indicate new window opens */
                            <Button variant="ghost"
                                    size="big"
                                    label={t('label.help')}
                                    icon={<Help/>}
                                    aria-label={t('label.helpNewWindow', {label: t('label.help'), interpolation: {escapeValue: false}})}
                                    onClick={() => window.open(t('help.url'), '_blank', 'noopener,noreferrer')}/>
                        }
                        toolbarLeft={
                            <ModulesActionBar
                                isLoading={isLoading}
                                isFiltered={isFiltered}
                                isClustered={isClustered}
                                hasUpdates={updates.length > 0}
                                lastUpdate={lastUpdate}
                                preferences={preferences}
                                onPreferencesChange={setPreferences}
                                onRefresh={() => {
                                    notify(t('label.fetchUpdates'), ['closeButton', 'closeAfter5s']);
                                    refreshAll();
                                }}
                                onClearFilters={clearFilters}
                                onUpload={() => setIsUploadOpen(true)}
                                onInstallFromStore={() => setIsInstallFromStoreOpen(true)}
                                onUpdateAll={() => handleUpdateAll([])}
                                onExport={() => setIsExportOpen(true)}
                                onGenerateScript={() => setIsGenerateScriptOpen(true)}
                                onCleanupJcr={handleCleanupJcr}
                                onClusterOperation={handleClusterOperation}
                            />
                        }
                    />
                }
            >
                {/* The admin shell holds the main landmark, so the table area is a named region inside it. */}
                <section className={styles.tableArea} aria-labelledby={TABLE_HEADING_ID}>
                    <h2 id={TABLE_HEADING_ID} className={styles.srOnly}>{t('label.table.title')}</h2>
                    <ModuleFilters filters={filters} states={states} hasUpdates={updates.length > 0} onChange={changeFilter}/>
                    {content}
                </section>

                <UploadModuleDialog isOpen={isUploadOpen}
                                    onClose={() => setIsUploadOpen(false)}
                                    onDeploySuccess={() => {
                                        setIsUploadOpen(false);
                                        notify(t('label.upload.deploySuccess'), ['closeButton', 'closeAfter5s']);
                                        // Re-check available updates for the newly deployed module
                                        refreshAll();
                                    }}/>
                <ExportModulesDialog isOpen={isExportOpen} onClose={() => setIsExportOpen(false)}/>
                <GenerateScriptDialog
                    isOpen={isGenerateScriptOpen}
                    modules={modules}
                    bundleTypes={parseBundleTypes(modulesManagement?.installedBundleTypes)}
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
                        notify(t('label.installFromStore.successNotification'), ['closeButton', 'closeAfter5s']);
                        refreshAll();
                    }}
                />
            </LayoutContent>
            {/* Outside LayoutContent, which swaps its children for a Loader, so the region exists from the first render. */}
            <div role="status" className={styles.srOnly} data-testid="modules-count-status">{countStatus}</div>
        </>
    );
};

export default ModuleManagementCommunityApp;
