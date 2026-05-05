import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {
    Button,
    Download,
    Loader,
    Reload,
    Separator,
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
import {Card, CardContent, CardHeader, TableSortLabel} from '@material-ui/core';
import dayjs from 'dayjs';
import ModuleRow from './ModuleRow';

const descendingComparator = (a, b, orderBy) => {
    if (!a[orderBy] && !b[orderBy]) {
        return 0;
    }

    if (!b[orderBy] || b[orderBy] < a[orderBy]) {
        return -1;
    }

    if (!a[orderBy] || b[orderBy] > a[orderBy]) {
        return 1;
    }

    return 0;
};

export const getComparator = (order, orderBy) => {
    return order === 'desc' ?
        (a, b) => descendingComparator(a, b, orderBy) :
        (a, b) => -descendingComparator(a, b, orderBy);
};

// Recursively resolve all modules that need to be updated together
const resolveAllDependentModules = (targetModule, dependencyStructure, updatesAvailable) => {
    const reverseDependencyMap = {};
    Object.entries(dependencyStructure).forEach(([module, dependencies]) => {
        dependencies.forEach(dep => {
            if (!reverseDependencyMap[dep]) {
                reverseDependencyMap[dep] = new Set();
            }

            reverseDependencyMap[dep].add(module);
        });
    });

    const result = new Set([targetModule]);

    const findDependentModules = module => {
        const dependentModules = reverseDependencyMap[module] || new Set();
        dependentModules.forEach(dependentModule => {
            if (!result.has(dependentModule) && updatesAvailable.some(u => u.name === dependentModule)) {
                result.add(dependentModule);
            }

            findDependentModules(dependentModule);
        });
    };

    if (dependencyStructure[targetModule]?.length > 0) {
        dependencyStructure[targetModule].forEach(dep => {
            if (!result.has(dep) && updatesAvailable.some(u => u.name === dep)) {
                result.add(dep);
            }
        });
    }

    findDependentModules(targetModule);
    return Array.from(result);
};

const ModuleManagementCommunityApp = () => {
    const notificationContext = useNotifications();
    const {t} = useTranslation('module-management-community');
    const [preferences, setPreferences] = useState({
        dryRun: true,
        jahiaOnly: true,
        autostart: true,
        uninstallPrevious: true,
        updatesOnly: false,
        onStartup: false
    });
    const [order, setOrder] = useState('asc');
    const [orderBy, setOrderBy] = useState('name');
    const [updates, setUpdates] = useState([]);
    const [modules, setModules] = useState([]);
    const [filter, setFilter] = useState('');
    const [debouncedFilter, setDebouncedFilter] = useState('');
    const [dependentUpdates, setDependentUpdates] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);

    const {
        data: initialData,
        error: initialError,
        loading: initialLoading,
        refetch: refreshAllModules
    } = useQuery(gql`query {
        admin { modulesManagement { installedModules clustered } }
    }`, {fetchPolicy: 'cache-and-network', pollInterval: 30000, initialFetchPolicy: 'network-only'});

    const {data, error, loading, refetch} = useQuery(gql`query {
        admin { modulesManagement { availableUpdates lastUpdateTime } }
    }`, {fetchPolicy: 'cache-and-network', initialFetchPolicy: 'standby'});

    const [updateAll] = useMutation(gql`mutation ($filter: [String], $dryRun: Boolean, $autostart: Boolean, $uninstall: Boolean, $onStartup: Boolean) {
        admin { modulesManagement { updateModules(jahiaOnly: true, filters: $filter, dryRun: $dryRun, autostart: $autostart, uninstallPrevious: $uninstall, onStartup: $onStartup) } }
    }`, {
        variables: {
            filter: [],
            dryRun: preferences.dryRun,
            autostart: preferences.autostart,
            uninstall: preferences.uninstallPrevious,
            onStartup: preferences.onStartup
        }
    });

    const [synchronize] = useMutation(gql`mutation { admin { modulesManagement { synchronizeBundles } } }`);
    const [push] = useMutation(gql`mutation { admin { modulesManagement { pushBundles } } }`);
    const [pull] = useMutation(gql`mutation { admin { modulesManagement { pullBundles } } }`);

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
        setCurrentPage(1);
    }, [debouncedFilter, preferences.updatesOnly]);

    useEffect(() => {
        const timerId = setTimeout(() => setDebouncedFilter(filter), 300);
        return () => clearTimeout(timerId);
    }, [filter]);

    const sortedModules = useMemo(() => [...modules].sort(getComparator(order, orderBy)), [modules, order, orderBy]);

    const handleSort = useCallback(property => {
        const isAsc = orderBy === property && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(property);
    }, [order, orderBy]);

    const handleDependentUpdate = useCallback((moduleName, deps) => {
        setDependentUpdates(prev => ({
            ...prev,
            [moduleName]: Array.isArray(deps) ? deps : [deps]
        }));
    }, []);

    if (error || initialError) {
        notificationContext.notify(t('label.errors.loadingVanityUrl'), ['closeButton', 'closeAfter5s']);
        return <>{t('label.errors.generic')}</>;
    }

    if (initialLoading || loading) {
        return (
            <Card>
                <CardHeader title={
                    <Typography
                        className={styles.title}
                        variant="heading"
                        weight="semiBold"
                    >
                        {t('label.table.title')}
                    </Typography>
                }/>
                <CardContent className={styles.flexCenter}>
                    <div className={styles.flex}><Loader size="big"/></div>
                </CardContent>
            </Card>
        );
    }

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

            await updateAll({
                variables: {
                    filter: expandedFilter,
                    jahiaOnly: preferences.jahiaOnly,
                    dryRun: preferences.dryRun,
                    autostart: preferences.autostart,
                    uninstall: preferences.uninstallPrevious,
                    onStartup: preferences.onStartup
                }
            });
            notificationContext.notify(
                expandedFilter.length > 0 ?
                    t('label.updateAllSuccessWithFilter', {modules: expandedFilter.join(', ')}) :
                    t('label.updateAllSuccess'),
                ['closeButton', 'closeAfter5s']
            );
            await refetch();
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

    const filteredModules = sortedModules.filter(m => {
        if (preferences.updatesOnly) {
            const hasDirectUpdate = updates.some(u => u.name === m.name);
            const hasDependentUpdate = dependentUpdates[m.name]?.length > 0;
            if (!hasDirectUpdate && !hasDependentUpdate) {
                return false;
            }
        }

        return debouncedFilter.trim() === '' ? true : m.name.toLowerCase().includes(debouncedFilter.trim().toLowerCase());
    });

    const isClustered = initialData.admin.modulesManagement.clustered;
    const lastUpdate = dayjs(data.admin.modulesManagement.lastUpdateTime).format('DD/MM/YYYY HH:mm');

    const SortableHeader = ({property, label}) => (
        <TableSortLabel
            active={orderBy === property}
            classes={{icon: orderBy === property ? styles.iconActive : styles.icon}}
            direction={orderBy === property ? order : 'asc'}
            onClick={() => handleSort(property)}
        >
            <Typography variant="body" weight="semiBold">{label}</Typography>
        </TableSortLabel>
    );

    return (
        <Card elevation={4}>
            <CardHeader
                title={
                    <Typography
                        className={styles.title}
                        variant="heading"
                        weight="semiBold"
                    >
                        {t('label.table.title')}
                    </Typography>
                }
                action={
                    <div className={styles.actionGroup}>
                        {isClustered && (
                            <div className={styles.columnMenu}>
                                <Typography variant="subheading"
                                            weight="bold"
                                >{t('label.table.actions.cluster')}
                                </Typography>
                                <Button variant="outlined"
                                        size="big"
                                        color="danger"
                                        label={t('label.table.actions.sync')}
                                        icon={<Reload/>}
                                        className={`${styles.button} ${styles.fixedWidthButton}`}
                                        onClick={() => handleClusterOperation('synchronize')}/>
                                <Button variant="outlined"
                                        size="big"
                                        color="danger"
                                        label={t('label.table.actions.push')}
                                        icon={<Upload/>}
                                        className={`${styles.button} ${styles.fixedWidthButton}`}
                                        onClick={() => handleClusterOperation('push')}/>
                                <Button variant="outlined"
                                        size="big"
                                        color="danger"
                                        label={t('label.table.actions.pull')}
                                        icon={<Download/>}
                                        className={`${styles.button} ${styles.fixedWidthButton}`}
                                        onClick={() => handleClusterOperation('pull')}/>
                            </div>
                        )}
                        <div className={styles.columnMenu}>
                            <Typography variant="subheading" weight="bold" className={styles.groupLabel}>
                                {t('label.input.group.updateOptions')}
                            </Typography>
                            {[
                                {key: 'dryRun', label: t('label.input.dryRun')},
                                {key: 'autostart', label: t('label.input.autostart')},
                                {key: 'uninstallPrevious', label: t('label.input.uninstallPrevious')},
                                {key: 'onStartup', label: t('label.input.onStartup')}
                            ].map(({key, label}) => (
                                <div key={key} className={styles.switchRow}>
                                    <Switch checked={preferences[key]}
                                            onChange={(e, value, checked) => setPreferences(p => ({
                                                ...p,
                                                [key]: checked
                                            }))}/>
                                    <Typography variant="body">{label}</Typography>
                                </div>
                            ))}
                        </div>
                        <Typography variant="subheading" weight="bold">
                            {t('label.lastUpdate', {date: lastUpdate})}
                        </Typography>
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
                        <Button variant="outlined"
                                size="big"
                                color="danger"
                                label={t('label.updateAll')}
                                icon={<Upload/>}
                                isDisabled={updates.length === 0}
                                className={styles.button}
                                onClick={() => handleUpdateAll([])}/>
                    </div>
                }
                classes={{action: styles.action}}
            />
            <CardContent>
                <Separator variant="horizontal" spacing="none"/>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableHeadCell>
                                <div className={styles.columnHeaderCell}>
                                    <div className={styles.columnHeaderRow}>
                                        <SortableHeader property="name" label={t('label.table.cells.name')}/>
                                    </div>
                                    <input type="text"
                                           placeholder={t('label.input.filterBySymbolicName')}
                                           value={filter}
                                           className={styles.columnFilterInput}
                                           onChange={e => setFilter(e.target.value)}/>
                                </div>
                            </TableHeadCell>
                            <TableHeadCell>
                                <SortableHeader property="version" label={t('label.table.cells.version')}/>
                            </TableHeadCell>
                            {updates.length > 0 && (
                                <TableHeadCell>
                                    <div className={styles.columnHeaderCell}>
                                        <div className={styles.columnHeaderRow}>
                                            <SortableHeader property="available"
                                                            label={t('label.table.cells.available')}/>
                                        </div>
                                        <label className={styles.columnCheckboxLabel}>
                                            <Switch checked={preferences.updatesOnly}
                                                    onChange={(e, value, checked) => setPreferences(p => ({
                                                        ...p,
                                                        updatesOnly: checked
                                                    }))}/>
                                            <Typography variant="caption">{t('label.input.updatesOnly')}</Typography>
                                        </label>
                                    </div>
                                </TableHeadCell>
                            )}
                            <TableHeadCell>
                                <SortableHeader property="state"
                                                label={isClustered ? t('label.table.cells.clusterstate') : t('label.table.cells.state')}/>
                            </TableHeadCell>
                            {isClustered && (
                                <TableHeadCell>
                                    <Typography variant="body"
                                                weight="semiBold"
                                    >{t('label.table.cells.cluster.nodes.state')}
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
                        {filteredModules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(module => (
                            <ModuleRow key={`${module.name}-${module.version}`}
                                       module={module}
                                       updates={updates}
                                       handleUpdate={handleUpdateAll}
                                       dependentUpdates={handleDependentUpdate}
                                       isClustered={isClustered}
                                       refreshAllModules={refreshAllModules}/>
                        ))}
                    </TableBody>
                </Table>
                <Separator variant="horizontal" spacing="none"/>
                <div className={styles.paginationContainer}>
                    <Typography variant="body" className={styles.paginationInfo}>
                        {t('label.pagination.showing', {
                            from: Math.min(((currentPage - 1) * itemsPerPage) + 1, filteredModules.length),
                            to: Math.min(currentPage * itemsPerPage, filteredModules.length),
                            total: filteredModules.length
                        })}
                    </Typography>
                    <div className={styles.paginationControls}>
                        <Button variant="ghost"
                                size="small"
                                label={t('label.pagination.previous')}
                                isDisabled={currentPage === 1}
                                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}/>
                        <select value={itemsPerPage}
                                className={styles.itemsPerPageSelect}
                                onChange={e => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                        >
                            <option value={20}>20</option>
                            <option value={40}>40</option>
                            <option value={60}>60</option>
                        </select>
                        <Button variant="ghost"
                                size="small"
                                label={t('label.pagination.next')}
                                isDisabled={currentPage >= Math.ceil(filteredModules.length / itemsPerPage)}
                                onClick={() => setCurrentPage(p => Math.min(p + 1, Math.ceil(filteredModules.length / itemsPerPage)))}/>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default ModuleManagementCommunityApp;
