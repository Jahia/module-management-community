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
    Menu,
    MenuItem,
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
import {Card, CardContent, CardHeader, Divider, TableSortLabel, Tooltip} from '@material-ui/core';
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
import PropTypes from 'prop-types';

// ── GraphQL documents ────────────────────────────────────────────────────────

/** Module types that are "Jahia modules" as opposed to plain OSGi bundles. */
const JAHIA_MODULE_TYPES = ['module', 'system', 'templatesSet'];

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

const SortableHeader = ({property, label, order, orderBy, onSort}) => (
    <TableSortLabel
        active={orderBy === property}
        classes={{icon: orderBy === property ? styles.iconActive : styles.icon}}
        direction={orderBy === property ? order : 'asc'}
        onClick={() => onSort(property)}
    >
        <Typography variant="body" weight="semiBold">{label}</Typography>
    </TableSortLabel>
);

SortableHeader.propTypes = {
    property: PropTypes.string,
    label: PropTypes.string,
    order: PropTypes.string,
    orderBy: PropTypes.string,
    onSort: PropTypes.func
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
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [dryRunResult, setDryRunResult] = useState(null);

    // ── Queries ────────────────────────────────────────────────────────────────

    const {
        data: initialData, error: initialError, loading: initialLoading,
        refetch: refreshAllModules
    } = useQuery(INSTALLED_MODULES_QUERY, {
        fetchPolicy: 'cache-and-network', pollInterval: 30000, initialFetchPolicy: 'network-only'
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
                    <Typography className={styles.title} variant="heading" weight="semiBold">
                        {t('label.table.title')}
                    </Typography>
                }/>
                <CardContent className={styles.flexCenter}>
                    <div className={styles.flex}><Loader size="big"/></div>
                </CardContent>
            </Card>
        );
    }

    // ── Filtered / paginated slice ─────────────────────────────────────────────

    const filteredModules = sortedModules.filter(m => {
        if (preferences.updatesOnly) {
            if (!updates.some(u => u.name === m.name) && !dependentUpdates[m.name]?.length) {
                return false;
            }
        }

        if (typeFilter === 'jahia') {
            // Show only Jahia module types; hide plain OSGi bundles
            const knownType = bundleTypes[m.name];
            if (knownType && !JAHIA_MODULE_TYPES.includes(knownType)) {
                return false;
            }
        } else if (typeFilter) {
            const knownType = bundleTypes[m.name];
            if (knownType && knownType !== typeFilter) {
                return false;
            }
        }

        return debouncedFilter.trim() === '' ?
            true :
            m.name.toLowerCase().includes(debouncedFilter.trim().toLowerCase());
    });

    const isClustered = initialData.admin.modulesManagement.clustered;
    const lastUpdate = dayjs(data.admin.modulesManagement.lastUpdateTime).format('DD/MM/YYYY HH:mm');
    const pageSlice = filteredModules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <Card elevation={4}>
            <CardHeader
                title={
                    <Typography className={styles.title} variant="heading" weight="semiBold">
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

                        <button className={styles.dotMenuBtn}
                                title={t('label.menu.title')}
                                type="button"
                                data-testid="more-actions-btn"
                                onClick={e => setMenuAnchor(e.currentTarget)}
                        >⋮
                        </button>
                        <Menu anchorEl={menuAnchor}
                              anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                              getContentAnchorEl={null}
                              isDisplayed={Boolean(menuAnchor)}
                              transformOrigin={{vertical: 'top', horizontal: 'right'}}
                              onClose={() => setMenuAnchor(null)}
                        >
                            <MenuItem label={t('label.upload.deploy')}
                                      iconStart={<Upload/>}
                                      onClick={() => {
                                          setMenuAnchor(null);
                                          setIsUploadOpen(true);
                                      }}/>
                            <MenuItem label={t('label.export.snapshot')}
                                      iconStart={<Download/>}
                                      onClick={() => {
                                          setMenuAnchor(null);
                                          setIsExportOpen(true);
                                      }}/>
                            <MenuItem label={t('label.generateScript.menuItem')}
                                      iconStart={<Download/>}
                                      onClick={() => {
                                          setMenuAnchor(null);
                                          setIsGenerateScriptOpen(true);
                                      }}/>
                            <Divider/>
                            <MenuItem label={t('label.cleanup.jcr')}
                                      iconStart={<DeletePermanently/>}
                                      onClick={handleCleanupJcr}/>
                            {isClustered && <Divider/>}
                            {isClustered && (
                                <MenuItem isDisabled
                                          label={t('label.cluster.ops.title')}
                                          iconStart={<Server/>}
                                          className={styles.menuSectionHeader}/>
                            )}
                            {isClustered && (
                                <MenuItem label={t('label.table.actions.sync')}
                                          iconStart={<Reload/>}
                                          onClick={() => {
                                              setMenuAnchor(null);
                                              handleClusterOperation('synchronize');
                                          }}/>
                            )}
                            {isClustered && (
                                <MenuItem label={t('label.table.actions.push')}
                                          iconStart={<Upload/>}
                                          onClick={() => {
                                              setMenuAnchor(null);
                                              handleClusterOperation('push');
                                          }}/>
                            )}
                            {isClustered && (
                                <MenuItem label={t('label.table.actions.pull')}
                                          iconStart={<Download/>}
                                          onClick={() => {
                                              setMenuAnchor(null);
                                              handleClusterOperation('pull');
                                          }}/>
                            )}
                            <Divider/>
                            <MenuItem isDisabled label={t('label.lastUpdate', {date: lastUpdate})}/>
                        </Menu>
                    </div>
                }
                classes={{action: styles.action, title: styles.titleWrapper}}
            />

            <CardContent className={styles.marginBorder}>
                <Separator variant="horizontal" spacing="none"/>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeadCell>
                                <div className={styles.columnHeaderCell}>
                                    <div className={styles.columnHeaderRow}>
                                        <SortableHeader property="name"
                                                        label={t('label.table.cells.name')}
                                                        order={order}
                                                        orderBy={orderBy}
                                                        onSort={handleSort}/>
                                    </div>
                                    <input type="text"
                                           placeholder={t('label.input.filterBySymbolicName')}
                                           value={filter}
                                           className={styles.columnFilterInput}
                                           onChange={e => setFilter(e.target.value)}/>
                                </div>
                            </TableHeadCell>

                            <TableHeadCell>
                                <div className={styles.columnHeaderCell}>
                                    <div className={styles.columnHeaderRow}>
                                        <Typography variant="body"
                                                    weight="semiBold"
                                        >{t('label.table.cells.type')}
                                        </Typography>
                                    </div>
                                    <select value={typeFilter}
                                            className={styles.columnFilterInput}
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

                            <TableHeadCell>
                                <SortableHeader property="version"
                                                label={t('label.table.cells.version')}
                                                order={order}
                                                orderBy={orderBy}
                                                onSort={handleSort}/>
                            </TableHeadCell>

                            {updates.length > 0 && (
                                <TableHeadCell>
                                    <div className={styles.columnHeaderCell}>
                                        <div className={styles.columnHeaderRow}>
                                            <SortableHeader property="available"
                                                            label={t('label.table.cells.available')}
                                                            order={order}
                                                            orderBy={orderBy}
                                                            onSort={handleSort}/>
                                        </div>
                                        <label className={styles.columnCheckboxLabel}>
                                            <Switch checked={preferences.updatesOnly}
                                                    onChange={(e, value, checked) => setPreferences({
                                                        ...preferences,
                                                        updatesOnly: checked
                                                    })}/>
                                            <Typography variant="caption">{t('label.input.updatesOnly')}</Typography>
                                        </label>
                                    </div>
                                </TableHeadCell>
                            )}

                            <TableHeadCell>
                                <SortableHeader property="state"
                                                label={isClustered ? t('label.table.cells.clusterstate') : t('label.table.cells.state')}
                                                order={order}
                                                orderBy={orderBy}
                                                onSort={handleSort}/>
                            </TableHeadCell>

                            {isClustered && (
                                <TableHeadCell>
                                    <Typography variant="body" weight="semiBold">
                                        {t('label.table.cells.cluster.nodes.state')}
                                    </Typography>
                                </TableHeadCell>
                            )}

                            <TableHeadCell>
                                <Typography variant="body"
                                            weight="semiBold"
                                >{t('label.table.actions.title')}
                                </Typography>
                            </TableHeadCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
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
        </Card>
    );
};

export {getComparator};
export default ModuleManagementCommunityApp;
