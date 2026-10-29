import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
import {buildModuleColumns} from './moduleColumns';
import {ModulesActionBar} from './ModulesActionBar';
import {ModuleFilters} from './filters/ModuleFilters';
import {UploadModuleDialog} from './UploadModuleDialog';
import {ExportModulesDialog} from './ExportModulesDialog';
import {DryRunResultDialog} from './DryRunResultDialog';
import {GenerateScriptDialog} from './GenerateScriptDialog';
import {InstallFromStoreDialog} from './InstallFromStoreDialog';

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
    const {t} = useTranslation('module-management-community');
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

    // ── Handlers ───────────────────────────────────────────────────────────────

    const changeFilter = (key, value) => {
        setFilters(old => ({...old, [key]: value}));
        setCurrentPage(1);
    };

    const clearFilters = () => {
        setFilters(DEFAULT_FILTERS);
        setCurrentPage(1);
    };

    const changeSort = (key, direction) => {
        setSortBy(key);
        setSortDirection(direction);
        setCurrentPage(1);
    };

    const handleDependentUpdate = useCallback((moduleName, deps) => {
        setDependentUpdates(prev => (prev[moduleName]?.join() === deps.join() ? prev : {...prev, [moduleName]: deps}));
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
                notificationContext.notify(
                    expandedFilter.length > 0 ?
                        t('label.updateAllSuccessWithFilter', {modules: expandedFilter.join(', ')}) :
                        t('label.updateAllSuccess'),
                    ['closeButton', 'closeAfter5s']
                );
                await refreshAll();
            }
        } catch (e) {
            console.error('Error updating modules:', e);
            notificationContext.notify(t('label.updateAllError'), ['closeButton', 'closeAfter5s']);
        }
    }, [dependentUpdates, updates, updateAll, preferences, notificationContext, t, refreshAll]);

    const handleClusterOperation = async operation => {
        const mutations = {synchronize, push, pull};
        try {
            await mutations[operation]();
            notificationContext.notify(t(`label.${operation}BundlesSuccess`), ['closeButton', 'closeAfter5s']);
            await refreshAll();
        } catch (e) {
            console.error(`Error during ${operation}:`, e);
            notificationContext.notify(t(`label.${operation}BundlesError`), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleCleanupJcr = async () => {
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

    const columns = useMemo(() => buildModuleColumns({
        t,
        updates,
        isClustered,
        refreshAllModules,
        onDependentUpdates: handleDependentUpdate,
        onUpdate: handleUpdateAll
    }), [t, updates, isClustered, refreshAllModules, handleDependentUpdate, handleUpdateAll]);

    // ── Render ─────────────────────────────────────────────────────────────────

    const error = installedError || updatesError;
    const isLoading = installedLoading || updatesLoading;
    const isFiltered = !isDefaultFilters(filters);

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
            <Paper hasPadding={false} className={styles.tableWrapper} aria-busy={isLoading} data-testid="modules-table">
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
                    rowProps={{className: styles.row}}
                    paginationProps={{className: styles.stickyPagination}}
                    aria-label={t('label.table.title')}
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
                                aria-label={`${t('label.help')} (opens in a new window)`}
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
                                notificationContext.notify(t('label.fetchUpdates'), ['closeButton', 'closeAfter5s']);
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
            {/* A11y CRITICAL-3: primary content wrapped in a <main> landmark */}
            <main className={styles.tableArea}>
                <ModuleFilters filters={filters} states={states} hasUpdates={updates.length > 0} onChange={changeFilter}/>
                {content}
            </main>

            <UploadModuleDialog isOpen={isUploadOpen}
                                onClose={() => setIsUploadOpen(false)}
                                onDeploySuccess={() => {
                                    setIsUploadOpen(false);
                                    notificationContext.notify(t('label.upload.deploySuccess'), ['closeButton', 'closeAfter5s']);
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
                    notificationContext.notify(t('label.installFromStore.successNotification'), ['closeButton', 'closeAfter5s']);
                    refreshAll();
                }}
            />
        </LayoutContent>
    );
};

export default ModuleManagementCommunityApp;
