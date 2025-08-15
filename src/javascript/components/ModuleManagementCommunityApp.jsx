import React, {memo, useCallback, useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {
    Accordion,
    AccordionItem,
    Badge,
    Button,
    Cancel,
    Chip,
    Close,
    Download,
    Information,
    Link,
    Loader,
    Power,
    Reload,
    Rocket,
    Switch,
    Table,
    TableBody,
    TableBodyCell,
    TableHead,
    TableHeadCell,
    TableRow,
    Typography,
    Upload
} from '@jahia/moonstone';
import styles from './ModuleManagementCommunityApp.scss';
import {Card, CardContent, CardHeader, Dialog, DialogActions, DialogContent, TableSortLabel} from '@material-ui/core';
import * as PropTypes from 'prop-types';
import dayjs from 'dayjs';
import Mermaid from './Mermaid';
import BundleDescriptionList from './BundleDescriptionList';

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

// Add this utility function at the top of your component
const resolveAllDependentModules = (targetModule, dependencyStructure, updatesAvailable) => {
    // Build reverse dependency map (which modules depend on a given module)
    const reverseDependencyMap = {};

    Object.entries(dependencyStructure).forEach(([module, dependencies]) => {
        dependencies.forEach(dependency => {
            if (!reverseDependencyMap[dependency]) {
                reverseDependencyMap[dependency] = new Set();
            }

            reverseDependencyMap[dependency].add(module);
        });
    });

    console.log('Reverse dependency map', reverseDependencyMap);
    console.log('Dependent updates for module', targetModule, 'are:', dependencyStructure[targetModule], 'from the dependency structure:', dependencyStructure);
    // Start with the target module
    const result = new Set([targetModule]);

    // Function to recursively find all dependent modules
    const findDependentModules = module => {
        const dependentModules = reverseDependencyMap[module] || new Set();

        dependentModules.forEach(dependentModule => {
            // If this dependent module hasn't been processed yet
            if (!result.has(dependentModule) && updatesAvailable.some(update => update.name === dependentModule)) {
                result.add(dependentModule);
            }

            // Recursively find dependent modules for this dependent module
            findDependentModules(dependentModule);
        });
    };

    // Add dependent module from dependencyStructure if they have an update pending
    if (dependencyStructure[targetModule] && dependencyStructure[targetModule].length > 0) {
        dependencyStructure[targetModule].forEach(dependency => {
            if (!result.has(dependency) && updatesAvailable.some(update => update.name === dependency)) {
                result.add(dependency);
            }
        });
    }

    findDependentModules(targetModule);
    console.log('All dependent modules for', targetModule, 'are:', Array.from(result));
    return Array.from(result);
};

const BundleDetails = ({bundle: initialBundle, t, close, refetch}) => {
    // Create local state to track the bundle data
    const [bundle, setBundle] = useState(initialBundle);

    // Update local state whenever the prop changes
    useEffect(() => {
        setBundle(initialBundle);
    }, [initialBundle]);

    const [enableOnSite] = useMutation(gql`mutation ($bundleId: Long!, $siteKeys: [String]!) {
        admin {
            modulesManagement {
                bundle(bundleId: $bundleId) {
                    enableOnSites(siteKeys: $siteKeys)
                }
            }
        }
    }`, {variables: {bundleId: bundle.bundleId, siteKeys: []}});

    const [disableOnSite] = useMutation(gql`mutation ($bundleId: Long!, $siteKeys: [String]!) {
        admin {
            modulesManagement {
                bundle(bundleId: $bundleId) {
                    disableOnSites(siteKeys: $siteKeys)
                }
            }
        }
    }`, {variables: {bundleId: bundle.bundleId, siteKeys: []}});
    const handleSiteDeployment = async (event, value, checked) => {
        try {
            // Call the mutation to update the deployment status
            if (checked) {
                await enableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: [value]}});
            } else {
                await disableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: [value]}});
            }

            // Update the local state to reflect the change
            await refetch();
        } catch (error) {
            console.error('Error updating site deployment:', error);
        }
    };

    // Add handlers for enabling on all sites or all sites except systemsite
    const handleEnableDisableOnAllSites = async enable => {
        try {
            const allSiteKeys = bundle.sitesDeployment.map(site => site.siteKey);
            if (enable) {
                await enableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: allSiteKeys}});
            } else {
                await disableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: allSiteKeys}});
            }

            await refetch();
        } catch (error) {
            console.error('Error enabling on all sites:', error);
        }
    };

    const handleEnableDisableExceptSystemSite = async enable => {
        try {
            const siteKeys = bundle.sitesDeployment
                .filter(site => site.siteKey !== 'systemsite')
                .map(site => site.siteKey);
            if (enable) {
                await enableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: siteKeys}});
            } else {
                await disableOnSite({variables: {bundleId: bundle.bundleId, siteKeys: siteKeys}});
            }

            await refetch();
        } catch (error) {
            console.error('Error enabling on sites except systemsite:', error);
        }
    };

    return (
        <>
            <DialogActions>
                <Button variant="outlined"
                        size="big"
                        color="accent"
                        label={t('label.refresh')}
                        icon={<Reload/>}
                        isDisabled={false}
                        className={styles.button}
                        onClick={() => refetch()}/>
                <Button variant="outlined"
                        size="big"
                        color="accent"
                        label={t('label.close')}
                        icon={<Close/>}
                        isDisabled={false}
                        className={styles.button}
                        onClick={() => close(false)}/>
            </DialogActions>
            <DialogContent className={styles.maxHeight}>
                <Accordion id="bundle" defaultOpenedItem="details" className={styles.maxHeight}>
                    <AccordionItem id="details" label="Details">
                        <div className={styles.maxHeight}>
                            <BundleDescriptionList bundle={bundle}/>
                        </div>
                    </AccordionItem>
                    {bundle.sitesDeployment.length > 0 && (
                        <AccordionItem id="sitesDeployment" label="Deployed on sites">
                            <div className={styles.maxHeight}>
                                {/* Add buttons for bulk operations */}
                                <div className={styles.siteActionButtons}>
                                    <Button variant="outlined"
                                            size="normal"
                                            color="accent"
                                            label={t('label.bundle.sites.actions.enableAllSites')}
                                            className={styles.siteActionButton}
                                            onClick={() => handleEnableDisableOnAllSites(true)}
                                    />
                                    <Button variant="outlined"
                                            size="normal"
                                            color="accent"
                                            label={t('label.bundle.sites.actions.enableAllSitesExceptSystem')}
                                            className={styles.siteActionButton}
                                            onClick={() => handleEnableDisableExceptSystemSite(true)}
                                    />
                                    <Button variant="outlined"
                                            size="normal"
                                            color="accent"
                                            label={t('label.bundle.sites.actions.disableAllSites')}
                                            className={styles.siteActionButton}
                                            onClick={() => handleEnableDisableOnAllSites(false)}
                                    />
                                    <Button variant="outlined"
                                            size="normal"
                                            color="accent"
                                            label={t('label.bundle.sites.actions.disableAllSitesExceptSystem')}
                                            className={styles.siteActionButton}
                                            onClick={() => handleEnableDisableExceptSystemSite(false)}
                                    />
                                </div>
                                <ul>
                                    {bundle.sitesDeployment.map(site => (
                                        <li key={site.siteKey} className={styles.siteItem}>
                                            <Switch checked={site.deployed} value={site.siteKey}
                                                    onChange={handleSiteDeployment}/>
                                            {site.deployed ? (
                                                <Badge label={site.siteKey} color="success"/>) : (
                                                <Badge label={site.siteKey} color="danger"/>)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </AccordionItem>)}
                    {bundle.dependenciesGraph && bundle.dependenciesGraph.length > 0 && (
                        <AccordionItem id="bundleDependencies" label="Bundle dependencies">
                            <div className={styles.maxHeight}>
                                <Mermaid>
                                    {bundle.dependenciesGraph}
                                </Mermaid>
                            </div>
                        </AccordionItem>)}
                    {bundle.moduleDependencies && bundle.moduleDependencies.length > 0 && (
                        <AccordionItem id="moduleDependencies" label="Module dependencies">
                            <div className={styles.maxHeight}>
                                <Mermaid>
                                    {bundle.moduleDependenciesGraph}
                                </Mermaid>
                            </div>
                        </AccordionItem>
                    )}
                </Accordion>
            </DialogContent>
        </>
    );
};

BundleDetails.propTypes = {
    bundle: PropTypes.object,
    t: PropTypes.func,
    close: PropTypes.func,
    refetch: PropTypes.func
};

const ClusterDeploymentStatus = ({clusterDeployment}) => {
    if (!clusterDeployment || clusterDeployment.length === 0) {
        return <span className={styles.noClusterData}>No cluster data</span>;
    }

    // Check if all nodes have the same state
    const firstNodeState = clusterDeployment[0]?.bundles[0]?.state;
    const isConsistent = clusterDeployment.every(node =>
        node.bundles[0]?.state === firstNodeState
    );

    // Check if all nodes have the same bundle version/key
    const firstNodeKey = clusterDeployment[0]?.bundles[0]?.key;
    const isVersionConsistent = clusterDeployment.every(node =>
        node.bundles[0]?.key === firstNodeKey
    );

    return (
        <div className={styles.clusterStatus}>
            {clusterDeployment.map(node => {
                const state = node.bundles[0]?.state;
                let color = state === 'ACTIVE' ? 'success' : 'danger';

                // If there's inconsistency, use warning color for all except ACTIVE nodes
                if (!isConsistent && state !== 'ACTIVE') {
                    color = 'warning';
                }

                // Show different indicator for version inconsistency
                const hasVersionIssue = !isVersionConsistent;

                return (
                    <div key={node.nodeId} className={styles.clusterNode}>
                        <Chip
                            variant={hasVersionIssue ? 'outlined' : 'bright'}
                            label={node.nodeId}
                            color={color}
                            icon={hasVersionIssue ? <Information/> : null}
                            title={`${node.bundles[0]?.key} - ${node.bundles[0]?.state}`}
                        />
                    </div>
                );
            })}
        </div>
    );
};

ClusterDeploymentStatus.propTypes = {
    clusterDeployment: PropTypes.arrayOf(PropTypes.shape({
        nodeId: PropTypes.string,
        bundles: PropTypes.arrayOf(PropTypes.shape({
            key: PropTypes.string,
            state: PropTypes.string
        }))
    }))
};

const ModuleRow = memo(({module, updates, handleUpdate, dependentUpdates, isClustered, t}) => {
    const notificationContext = useNotifications();
    const [open, setOpen] = useState(false);
    const {data, error, loading, refetch} = useQuery(gql`query ($module: String!) {
        admin {
            modulesManagement {
                bundle(name: $module) {
                    symbolicName
                    bundleId
                    state
                    version
                    manifest {
                        key
                        value
                    }
                    dependencies
                    dependenciesGraph(depth:2)
                    moduleDependencies
                    moduleDependenciesGraph
                    nodeTypesDependencies
                    license
                    services
                    servicesInUse
                    sitesDeployment {
                        siteKey
                        deployed
                    }
                    clusterDeployment {
                        nodeId
                        bundles {
                            key
                            state
                        }
                    }
                    clusterState
                }
            }
        }
    }`, {fetchPolicy: 'cache-and-network', variables: {module: module.name}});

    const [stopBundle] = useMutation(gql`mutation ($bundleId: Long!) {
        admin {
            modulesManagement {
                bundle(bundleId: $bundleId) {
                    stop
                }
            }
        }
    }`, {variables: {bundleId: data?.admin?.modulesManagement?.bundle?.bundleId}});

    const handleStopBundle = async () => {
        try {
            await stopBundle();
            notificationContext.notify(t('label.stopBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refetch();
        } catch (e) {
            console.error('Error stopping bundle:', e);
            notificationContext.notify(t('label.stopBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const [startBundle] = useMutation(gql`mutation ($bundleId: Long!) {
        admin {
            modulesManagement {
                bundle(bundleId: $bundleId) {
                    start
                }
            }
        }
    }`, {variables: {bundleId: data?.admin?.modulesManagement?.bundle?.bundleId}});

    const handleStartBundle = async () => {
        try {
            await startBundle();
            notificationContext.notify(t('label.startBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refetch();
        } catch (e) {
            console.error('Error starting bundle:', e);
            notificationContext.notify(t('label.startBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const [refreshBundle] = useMutation(gql`mutation ($bundleId: Long!) {
        admin {
            modulesManagement {
                bundle(bundleId: $bundleId) {
                    refresh
                }
            }
        }
    }`, {variables: {bundleId: data?.admin?.modulesManagement?.bundle?.bundleId}});

    const handleRefreshBundle = async () => {
        try {
            await refreshBundle();
            notificationContext.notify(t('label.startBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refetch();
        } catch (e) {
            console.error('Error starting bundle:', e);
            notificationContext.notify(t('label.startBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    useEffect(() => {
        const bundle = data?.admin?.modulesManagement?.bundle;

        if (bundle !== undefined) {
            // Determine if this bundle update needs to be bound to other bundle updates (check across bundle.moduleDependencies) for available updates
            const hasDependencyUpdate = bundle.moduleDependencies && bundle.moduleDependencies.some(dep => {
                return updates.some(update => update.name === dep.split(' [')[0]);
            });

            if (hasDependencyUpdate) {
                dependentUpdates(bundle.symbolicName, updates.filter(update => bundle.moduleDependencies.find(dep => dep.split(' [')[0] === update.name)).map(update => update.name));
            }

            // If there is no moduleDependencies, we need to chek the bundle.dependencies
            const hasDependencyUpdateInDependencies = bundle.dependencies && bundle.dependencies.some(dep => {
                return updates.some(update => update.name === dep.split(' [')[0]);
            });
            if (hasDependencyUpdateInDependencies) {
                dependentUpdates(bundle.symbolicName, updates.filter(update => bundle.dependencies.find(dep => dep.split(' [')[0] === update.name)).map(update => update.name));
            }
        }
    }, [data, updates, dependentUpdates]);

    if (error) {
        console.error('Error when fetching module data: ' + error);
        return <TableRow><TableBodyCell colSpan={4}>{t('label.errors.loadingModuleData')}</TableBodyCell></TableRow>;
    }

    if (loading) {
        return (
            <TableRow>
                <TableBodyCell colSpan={5}>
                    <div className={styles.flexCenter}>
                        <Loader size="small"/>
                    </div>
                </TableBodyCell>
            </TableRow>
        );
    }

    const bundle = data?.admin?.modulesManagement?.bundle;

    if (!bundle) {
        return (
            <TableRow>
                <TableBodyCell colSpan={5}>
                    {t('label.errors.moduleNotFound', {module})}
                </TableBodyCell>
            </TableRow>
        );
    }

    // Check if the module has an update available
    const updateAvailable = updates.some(update => update.name === bundle.symbolicName && update.version === bundle.version);
    // Get the list of dependent updates for this bundle
    let dependentUpdateList;
    if (bundle.moduleDependencies === undefined || bundle.moduleDependencies === null || bundle.moduleDependencies.length === 0) {
        dependentUpdateList = updates.filter(update => bundle.dependencies && bundle.dependencies.find(dep => dep.split(' [')[0] === update.name)).map(update => update.name);
    } else {
        dependentUpdateList = updates.filter(update => bundle.moduleDependencies && bundle.moduleDependencies.find(dep => dep.split(' [')[0] === update.name)).map(update => update.name);
    }

    let dependentUpdateLabel = `Dependant updates: ${dependentUpdateList}`;
    return (
        <TableRow>
            <TableBodyCell>
                <Typography variant="subheading" weight="semiBold">
                    {bundle.symbolicName} [{bundle.bundleId}]
                </Typography>
            </TableBodyCell>
            <TableBodyCell>
                <Badge label={bundle.version} color="accent"/>
            </TableBodyCell>
            {updates.length > 0 && (
                <TableBodyCell>
                    {updateAvailable && (
                        <Badge
                            label={updates.find(update => update.name === bundle.symbolicName && update.version === bundle.version).available}
                            color="success"/>
                    )}
                    {dependentUpdateList.length > 0 && (
                        <Chip variant="bright" color="reassuring" label={dependentUpdateLabel} icon={<Link/>}/>
                    )}
                </TableBodyCell>)}
            <TableBodyCell>
                <Chip variant="bright"
                      label={bundle.state}
                      color={bundle.state === 'ACTIVE' ? 'success' : 'danger'}
                      icon={<Rocket/>}/>
                {isClustered && bundle.clusterState !== 'UNKNOWN' && (
                    <Chip variant="bright"
                          label={bundle.clusterState}
                          color={bundle.clusterState === 'ACTIVE' ? 'success' : 'danger'}
                          icon={<Rocket/>}/>
                )}
                {isClustered && bundle.clusterState === 'UNKNOWN' && (
                    <Chip variant="default"
                          label={t('label.cluster.state.not.sync.short')}
                          color="reassuring"
                          icon={<Information/>}
                          title={t('label.cluster.state.not.sync.long')}/>
                )}
            </TableBodyCell>
            {isClustered && (
                <TableBodyCell>
                    <ClusterDeploymentStatus clusterDeployment={bundle.clusterDeployment}/>
                </TableBodyCell>)}
            <TableBodyCell>
                <div className={styles.actionGroup} style={{width: 'fit-content'}}>
                    {bundle.state === 'RESOLVED' && <Button variant="outlined"
                                                            size="big"
                                                            color="success"
                                                            label=""
                                                            icon={<Power/>}
                                                            isDisabled={false}
                                                            className={styles.button}
                                                            onClick={handleStartBundle}/>}
                    {bundle.state === 'ACTIVE' && (
                        <>
                            <Button variant="outlined"
                                    size="big"
                                    color="danger"
                                    label=""
                                    icon={<Cancel/>}
                                    isDisabled={false}
                                    className={styles.button}
                                    onClick={handleStopBundle}/>
                            <Button variant="outlined"
                                    size="big"
                                    color="danger"
                                    label=""
                                    icon={<Reload/>}
                                    isDisabled={false}
                                    className={styles.button}
                                    onClick={handleRefreshBundle}/>
                            {updateAvailable && (
                                <Button variant="outlined"
                                        size="big"
                                        color="danger"
                                        label=""
                                        icon={<Upload/>}
                                        isDisabled={false}
                                        className={styles.button}
                                        onClick={() => {
                                            console.log('Updating bundle:', bundle.symbolicName);
                                            handleUpdate(bundle.symbolicName);
                                        }}/>
                            )}
                        </>
                    )}
                    <Button variant="outlined"
                            size="big"
                            color="accent"
                            label="Show details"
                            icon={<Information/>}
                            isDisabled={false}
                            className={styles.button}
                            onClick={() => setOpen(true)}/>
                </div>
                <Dialog fullWidth open={open} maxWidth="100vw" maxHeight="100vw" onClose={() => setOpen(false)}>
                    <BundleDetails bundle={bundle} t={t} close={setOpen} refetch={refetch}/>
                </Dialog>
            </TableBodyCell>
        </TableRow>
    );
});

ModuleRow.propTypes = {
    module: PropTypes.any,
    updates: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        version: PropTypes.string,
        available: PropTypes.string
    })),
    handleUpdate: PropTypes.func,
    dependentUpdates: PropTypes.func,
    isClustered: PropTypes.bool,
    t: PropTypes.func
};

const ModuleManagementCommunityApp = () => {
    const notificationContext = useNotifications();
    const {t} = useTranslation('module-management-community');
    const [preferences, setPreferences] = useState({
        dryRun: true,
        jahiaOnly: true,
        autostart: true,
        uninstallPrevious: true,
        updatesOnly: false
    });
    const [order, setOrder] = React.useState('asc');
    const [orderBy, setOrderBy] = React.useState('name');
    const [updates, setUpdates] = React.useState([]);
    const [modules, setModules] = React.useState([]);
    const [filter, setFilter] = useState('');
    const [debouncedFilter, setDebouncedFilter] = useState('');
    const [dependentUpdates, setDependentUpdates] = useState({});
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const {data: initialData, error: initialError, loading: initialLoading} = useQuery(gql`query {
        admin {
            modulesManagement {
                installedModules
                clustered
            }
        }
    }`, {fetchPolicy: 'cache-and-network', pollInterval: 30000, initialFetchPolicy: 'network-only'});

    const {data, error, loading, refetch} = useQuery(gql`query {
        admin {
            modulesManagement {
                availableUpdates
                lastUpdateTime
            }
        }
    }`, {fetchPolicy: 'cache-and-network', initialFetchPolicy: 'standby'});

    const [updateAll] = useMutation(gql`mutation ($filter: [String], $dryRun: Boolean, $autostart: Boolean, $uninstall: Boolean) {
        admin {
            modulesManagement {
                updateModules(jahiaOnly: true, filters: $filter, dryRun: $dryRun, autostart: $autostart, uninstallPrevious: $uninstall)
            }
        }
    }`, {
        variables: {
            filter: [],
            dryRun: preferences.dryRun,
            autostart: preferences.autostart,
            uninstall: preferences.uninstallPrevious
        }
    });

    const [synchronize] = useMutation(gql`mutation {
        admin {
            modulesManagement {
                synchronizeBundles
            }
        }
    }`);

    const [push] = useMutation(gql`mutation {
        admin {
            modulesManagement {
                pushBundles
            }
        }
    }`);

    const [pull] = useMutation(gql`mutation {
        admin {
            modulesManagement {
                pullBundles
            }
        }
    }`);

    useEffect(() => {
        if (data && data.admin && data.admin.modulesManagement && data.admin.modulesManagement.availableUpdates) {
            const availableUpdates = data.admin.modulesManagement.availableUpdates.map((module => ({
                name: module.substring(0, module.indexOf('/')).trim(),
                version: module.substring(module.indexOf('/') + 1, module.indexOf(':')).trim(),
                available: module.substring(module.indexOf(':') + 1).trim()
            })));
            setUpdates(availableUpdates);
        }
    }, [data, order, orderBy]);

    useEffect(() => {
        if (initialData?.admin?.modulesManagement?.installedModules) {
            const installedModules = initialData.admin.modulesManagement.installedModules.map((module => ({
                name: module.substring(0, module.indexOf('/')).trim(),
                version: module.substring(module.indexOf('/') + 1, module.indexOf(':')).trim(),
                state: module.substring(module.indexOf(':') + 1).trim(),
                available: updates.find(update => update.name === module.substring(0, module.indexOf('/')).trim())?.available || 'No update available'
            })));
            installedModules.sort(getComparator(order, orderBy));
            setModules(installedModules);
        }
    }, [initialData, order, orderBy, updates]);

    useEffect(() => {
        // Reset to page 1 when filter changes
        setCurrentPage(1);
    }, [debouncedFilter, preferences.updatesOnly]);

    // Add debounce effect
    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedFilter(filter);
        }, 300); // 300ms debounce delay

        return () => {
            clearTimeout(timerId);
        };
    }, [filter]);

    const sortedModules = useMemo(() => {
        return [...modules].sort(getComparator(order, orderBy));
    }, [modules, order, orderBy]);

    const handleSort = useCallback(property => {
        const isAsc = orderBy === property && order === 'asc';
        const sortOrder = isAsc ? 'desc' : 'asc';
        setOrder(sortOrder);
        setOrderBy(property);
    }, [order, orderBy]);

    if (error || initialError) {
        console.log('Error when fetching data: ', error, initialError);
        notificationContext.notify(t('label.errors.loadingVanityUrl'), ['closeButton', 'closeAfter5s']);
        return <>error</>;
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
                    <div className={styles.flex}>
                        <Loader size="big"/>
                    </div>
                </CardContent>
            </Card>
        );
    }

    const handleClick = async () => {
        notificationContext.notify(t('label.fetchUpdates'), ['closeButton', 'closeAfter5s']);
        await refetch();
    };

    const handleDependentUpdate = (moduleName, updates) => {
        // Ensure dependent updates are stored as an array of strings
        setDependentUpdates(prev => ({
            ...prev,
            [moduleName]: Array.isArray(updates) ? updates : [updates]
        }));
    };

    const handleUpdateAll = async filter => {
        try {
            if (filter === undefined || filter === null || filter.length === 0) {
                console.log('No filter provided, updating all modules');
                await updateAll({
                    variables: {
                        filter: [],
                        jahiaOnly: preferences.jahiaOnly,
                        dryRun: preferences.dryRun,
                        autostart: preferences.autostart,
                        uninstall: preferences.uninstallPrevious
                    }
                });
                notificationContext.notify(t('label.updateAllSuccess'), ['closeButton', 'closeAfter5s']);
                await refetch();
            } else {
                console.log('filter', filter);
                if (!Array.isArray(filter)) {
                    filter = [filter];
                }

                // Expand the filter to include all dependent modules
                let expandedFilter = [];
                filter.forEach(module => {
                    const allDependents = resolveAllDependentModules(module, dependentUpdates, updates);
                    expandedFilter = [...expandedFilter, ...allDependents];
                });

                // Remove duplicates
                expandedFilter = Array.from(new Set(expandedFilter)).sort();

                console.log('Expanded filter with all dependencies:', expandedFilter);

                await updateAll({
                    variables: {
                        filter: expandedFilter,
                        jahiaOnly: preferences.jahiaOnly,
                        dryRun: preferences.dryRun,
                        autostart: preferences.autostart,
                        uninstall: preferences.uninstallPrevious
                    }
                });

                notificationContext.notify(
                    t('label.updateAllSuccessWithFilter', {modules: expandedFilter.join(', ')}),
                    ['closeButton', 'closeAfter5s']
                );

                await refetch();
            }
        } catch
            (e) {
            console.error('Error updating all modules:', e);
            notificationContext.notify(t('label.updateAllError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleClusterOperation = async operation => {
        try {
            if (operation === 'synchronize') {
                await synchronize();
                notificationContext.notify(t('label.synchronizeBundlesSuccess'), ['closeButton', 'closeAfter5s']);
            } else if (operation === 'push') {
                await push();
                notificationContext.notify(t('label.pushBundlesSuccess'), ['closeButton', 'closeAfter5s']);
            } else if (operation === 'pull') {
                await pull();
                notificationContext.notify(t('label.pullBundlesSuccess'), ['closeButton', 'closeAfter5s']);
            }

            await refetch();
        } catch (e) {
            console.error(`Error during ${operation} operation:`, e);
            notificationContext.notify(t(`label.${operation}BundlesError`), ['closeButton', 'closeAfter5s']);
        }
    };

    // Filter modules by symbolicName (case-insensitive)
    const filteredModules = sortedModules.filter(
        m => {
            if (preferences.updatesOnly && !updates.some(update => update.name === m.name)) {
                return false;
            }

            return debouncedFilter.trim() === '' ? true : m.name.toLowerCase().includes(debouncedFilter.trim().toLowerCase());
        }
    );

    const tableHead = () => {
        return (
            <TableHead>
                <TableRow>
                    <TableHeadCell>
                        <TableSortLabel
                            active={orderBy === 'name'}
                            classes={{icon: orderBy === 'name' ? styles.iconActive : styles.icon}}
                            direction={orderBy === 'name' ? order : 'asc'}
                            onClick={() => handleSort('name')}
                        >
                            <Typography variant="body"
                                        weight="semiBold"
                            >{t('label.table.cells.name')}
                            </Typography>
                        </TableSortLabel>
                    </TableHeadCell>
                    <TableHeadCell>
                        <TableSortLabel
                            active={orderBy === 'version'}
                            classes={{icon: orderBy === 'version' ? styles.iconActive : styles.icon}}
                            direction={orderBy === 'version' ? order : 'asc'}
                            onClick={() => handleSort('version')}
                        >
                            <Typography variant="body"
                                        weight="semiBold"
                            >{t('label.table.cells.version')}
                            </Typography>
                        </TableSortLabel>
                    </TableHeadCell>
                    {updates.length > 0 && (
                        <TableHeadCell>
                            <TableSortLabel
                                active={orderBy === 'available'}
                                classes={{icon: orderBy === 'available' ? styles.iconActive : styles.icon}}
                                direction={orderBy === 'available' ? order : 'asc'}
                                onClick={() => handleSort('available')}
                            >
                                <Typography variant="body"
                                            weight="semiBold"
                                >{t('label.table.cells.available')}
                                </Typography>
                            </TableSortLabel>
                        </TableHeadCell>)}
                    <TableHeadCell>
                        <TableSortLabel
                            active={orderBy === 'state'}
                            classes={{icon: orderBy === 'state' ? styles.iconActive : styles.icon}}
                            direction={orderBy === 'state' ? order : 'asc'}
                            onClick={() => handleSort('state')}
                        >
                            <Typography variant="body"
                                        weight="semiBold"
                            >{initialData.admin.modulesManagement.clustered ? t('label.table.cells.clusterstate') : t('label.table.cells.state')}
                            </Typography>
                        </TableSortLabel>
                    </TableHeadCell>
                    {initialData.admin.modulesManagement.clustered && (
                        <TableHeadCell>
                            <Typography variant="body" weight="semiBold">
                                {t('label.table.cells.clusterState')}
                            </Typography>
                        </TableHeadCell>)}
                    <TableHeadCell>
                        <Typography variant="body"
                                    weight="semiBold"
                        >{t('label.table.actions.title')}
                        </Typography>
                    </TableHeadCell>
                </TableRow>
            </TableHead>
        );
    };

    return (
        <Card>
            <CardHeader title={
                <Typography className={styles.title} variant="heading" weight="semiBold">
                    {t('label.table.title')}
                </Typography>
            }
                        action={
                            <div className={styles.actionGroup}>
                                {initialData.admin.modulesManagement.clustered && (
                                    <div className={styles.columnMenu}>
                                        <Typography variant="subheading" weight="bold">
                                            {t('label.table.actions.cluster')}
                                        </Typography>
                                        <Button variant="outlined"
                                                size="big"
                                                color="danger"
                                                label={t('label.table.actions.sync')}
                                                icon={<Reload/>}
                                                className={`${styles.button} ${styles.fixedWidthButton}`}
                                                onClick={() => {
                                                    console.log('Synchronizing(pulling) bundles across cluster nodes');
                                                    handleClusterOperation('synchronize');
                                                }}/>
                                        <Button variant="outlined"
                                                size="big"
                                                color="danger"
                                                label={t('label.table.actions.push')}
                                                icon={<Upload/>}
                                                className={`${styles.button} ${styles.fixedWidthButton}`}
                                                onClick={() => {
                                                    console.log('Pushing local bundles across cluster nodes');
                                                    handleClusterOperation('push');
                                                }}/>
                                        <Button variant="outlined"
                                                size="big"
                                                color="danger"
                                                label={t('label.table.actions.pull')}
                                                icon={<Download/>}
                                                className={`${styles.button} ${styles.fixedWidthButton}`}
                                                onClick={() => {
                                                    console.log('Pulling bundles across cluster nodes');
                                                    handleClusterOperation('pull');
                                                }}/>
                                    </div>)}
                                <label className={styles.columnMenu}>{t('label.input.filterBySymbolicName')}
                                    <input
                                        type="text"
                                        placeholder="Filter by symbolic name"
                                        value={filter}
                                        style={{marginRight: 16}}
                                        onChange={e => setFilter(e.target.value)}
                                    />
                                </label>
                                <div className={styles.columnMenu}>
                                    <label style={{marginBottom: '8px'}}>
                                        <input
                                            type="checkbox"
                                            style={{marginRight: '8px'}}
                                            checked={preferences.dryRun}
                                            onChange={e => setPreferences({...preferences, dryRun: e.target.checked})}
                                        />
                                        {t('label.input.dryRun')}
                                    </label>
                                    <label style={{marginBottom: '8px'}}>
                                        <input
                                            type="checkbox"
                                            style={{marginRight: '8px'}}
                                            checked={preferences.autostart}
                                            onChange={e => setPreferences({
                                                ...preferences,
                                                autostart: e.target.checked
                                            })}
                                        />
                                        {t('label.input.autostart')}
                                    </label>
                                    <label style={{marginBottom: '8px'}}>
                                        <input
                                            type="checkbox"
                                            style={{marginRight: '8px'}}
                                            checked={preferences.uninstallPrevious}
                                            onChange={e => setPreferences({
                                                ...preferences,
                                                uninstallPrevious: e.target.checked
                                            })}
                                        />
                                        {t('label.input.uninstallPrevious')}
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            style={{marginRight: '8px'}}
                                            checked={preferences.updatesOnly}
                                            onChange={e => setPreferences({
                                                ...preferences,
                                                updatesOnly: e.target.checked
                                            })}
                                        />
                                        {t('label.input.updatesOnly')}
                                    </label>
                                </div>
                                {/* <label>{t('label.input.jahiaOnly')} */}
                                {/*    <input */}
                                {/*        type="checkbox" */}
                                {/*        checked={preferences.jahiaOnly} */}
                                {/*        onChange={e => setPreferences({...preferences, jahiaOnly: e.target.checked})} */}
                                {/*    /> */}
                                {/* </label> */}
                                <Typography variant="subheading" weight="bold">
                                    {t('label.lastUpdate', {date: dayjs(data.admin.modulesManagement.lastUpdateTime).format('DD/MM/YYYY HH:mm')})}
                                </Typography>
                                <Button variant="outlined"
                                        size="big"
                                        color="accent"
                                        label={t('label.refresh')}
                                        icon={<Reload/>}
                                        isDisabled={false}
                                        className={styles.button}
                                        onClick={handleClick}/>
                                <Button variant="outlined"
                                        size="big"
                                        color="danger"
                                        label={t('label.updateAll')}
                                        icon={<Upload/>}
                                        isDisabled={updates.length === 0}
                                        className={styles.button}
                                        onClick={() => {
                                            console.log('Updating all modules with no filter:');
                                            handleUpdateAll();
                                        }}/>
                            </div>
                        }
                        classes={{action: styles.action}}
            />
            <CardContent>
                <Table>
                    {tableHead()}
                    <TableBody>
                        {filteredModules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map(module => (
                            <ModuleRow key={module.name}
                                       module={module}
                                       updates={updates}
                                       handleUpdate={handleUpdateAll}
                                       dependentUpdates={handleDependentUpdate}
                                       isClustered={initialData.admin.modulesManagement.clustered}
                                       t={t}/>
                        ))}
                    </TableBody>
                </Table>
                {/* Pagination controls */}
                <div className={styles.paginationContainer}>
                    <div className={styles.paginationInfo}>
                        <Typography variant="body">
                            {t('label.pagination.showing', {
                                from: Math.min(((currentPage - 1) * itemsPerPage) + 1, filteredModules.length),
                                to: Math.min(currentPage * itemsPerPage, filteredModules.length),
                                total: filteredModules.length
                            })}
                        </Typography>
                    </div>
                    <div className={styles.paginationControls}>
                        <Button
                            variant="ghost"
                            size="small"
                            label={t('label.pagination.previous')}
                            isDisabled={currentPage === 1}
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        />

                        <select
                            value={itemsPerPage}
                            className={styles.itemsPerPageSelect}
                            onChange={e => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1); // Reset to first page when changing items per page
                            }}
                        >
                            <option value={20}>20</option>
                            <option value={40}>40</option>
                            <option value={60}>60</option>
                        </select>

                        <Button
                            variant="ghost"
                            size="small"
                            label={t('label.pagination.next')}
                            isDisabled={currentPage >= Math.ceil(filteredModules.length / itemsPerPage)}
                            onClick={() => setCurrentPage(prev =>
                                Math.min(prev + 1, Math.ceil(filteredModules.length / itemsPerPage))
                            )}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};

export default ModuleManagementCommunityApp;
