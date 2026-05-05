import React, {memo, useEffect, useState} from 'react';
import {useMutation, useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {
    Badge,
    Button,
    Cancel,
    Chip,
    Delete,
    Information,
    Link,
    Loader,
    Power,
    Reload,
    Rocket,
    TableBodyCell,
    TableRow,
    Typography,
    Upload
} from '@jahia/moonstone';
import {Dialog} from '@material-ui/core';
import * as PropTypes from 'prop-types';
import styles from './ModuleManagementCommunityApp.scss';
import BundleDetails from './BundleDetails';
import ClusterDeploymentStatus from './ClusterDeploymentStatus';

const BUNDLE_QUERY = gql`query ($module: String!, $version: String!) {
    admin {
        modulesManagement {
            bundle(name: $module, version: $version) {
                symbolicName bundleId state version
                manifest { key value }
                dependencies
                dependenciesGraph(depth: 2)
                moduleDependencies
                moduleDependenciesGraph
                nodeTypesDependencies
                license services servicesInUse
                sitesDeployment { siteKey deployed }
                clusterDeployment { nodeId bundles { key state } }
                clusterState
            }
        }
    }
}`;

const ModuleRow = memo(({module, updates, handleUpdate, dependentUpdates, isClustered, refreshAllModules}) => {
    const {t} = useTranslation('module-management-community');
    const notificationContext = useNotifications();
    const [open, setOpen] = useState(false);

    const {data, error, loading, refetch} = useQuery(BUNDLE_QUERY, {
        fetchPolicy: 'cache-and-network',
        variables: {module: module.name, version: module.version}
    });

    const bundleId = data?.admin?.modulesManagement?.bundle?.bundleId;

    const [stopBundle] = useMutation(gql`mutation ($bundleId: Long!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { stop } } }
    }`, {variables: {bundleId}});

    const [startBundle] = useMutation(gql`mutation ($bundleId: Long!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { start } } }
    }`, {variables: {bundleId}});

    const [refreshBundle] = useMutation(gql`mutation ($bundleId: Long!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { refresh } } }
    }`, {variables: {bundleId}});

    const [uninstallBundle] = useMutation(gql`mutation ($bundleId: Long!) {
        admin { modulesManagement { bundle(bundleId: $bundleId) { uninstall } } }
    }`, {variables: {bundleId}});

    const handleStopBundle = async () => {
        try {
            await stopBundle();
            notificationContext.notify(t('label.stopBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refetch();
            await refreshAllModules();
        } catch (e) {
            console.error('Error stopping bundle:', e);
            notificationContext.notify(t('label.stopBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleStartBundle = async () => {
        try {
            await startBundle();
            notificationContext.notify(t('label.startBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refetch();
            await refreshAllModules();
        } catch (e) {
            console.error('Error starting bundle:', e);
            notificationContext.notify(t('label.startBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleRefreshBundle = async () => {
        try {
            await refreshBundle();
            notificationContext.notify(t('label.startBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refetch();
            await refreshAllModules();
        } catch (e) {
            console.error('Error refreshing bundle:', e);
            notificationContext.notify(t('label.startBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const handleUninstallBundle = async () => {
        try {
            await uninstallBundle();
            notificationContext.notify(t('label.uninstallBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refreshAllModules();
        } catch (e) {
            console.error('Error uninstalling bundle:', e);
            notificationContext.notify(t('label.uninstallBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    useEffect(() => {
        const bundle = data?.admin?.modulesManagement?.bundle;
        if (bundle !== undefined) {
            const depList = bundle.moduleDependencies?.length > 0 ? bundle.moduleDependencies : bundle.dependencies;
            if (depList) {
                const deps = updates
                    .filter(update => depList.find(dep => dep.split(' [')[0] === update.name))
                    .map(update => update.name);
                if (deps.length > 0) {
                    dependentUpdates(bundle.symbolicName, deps);
                }
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
                    <div className={styles.flexCenter}><Loader size="small"/></div>
                </TableBodyCell>
            </TableRow>
        );
    }

    const bundle = data?.admin?.modulesManagement?.bundle;

    if (!bundle) {
        return (
            <TableRow>
                <TableBodyCell colSpan={5}>{t('label.errors.moduleNotFound', {module})}</TableBodyCell>
            </TableRow>
        );
    }

    const updateAvailable = updates.some(u => u.name === bundle.symbolicName && u.version === bundle.version);

    const depList = bundle.moduleDependencies?.length > 0 ? bundle.moduleDependencies : bundle.dependencies;
    const dependentUpdateList = depList ?
        updates.filter(u => depList.find(dep => dep.split(' [')[0] === u.name)).map(u => u.name) :
        [];

    return (
        <TableRow>
            <TableBodyCell>
                <Typography variant="subheading" weight="semiBold">
                    {bundle.symbolicName} <Typography variant="caption">[{bundle.bundleId}]</Typography>
                </Typography>
            </TableBodyCell>
            <TableBodyCell>
                <Badge label={bundle.version} color="accent"/>
            </TableBodyCell>
            {updates.length > 0 && (
                <TableBodyCell>
                    {updateAvailable && (
                        <Badge label={updates.find(u => u.name === bundle.symbolicName && u.version === bundle.version).available}
                               color="success"/>
                    )}
                    {dependentUpdateList.length > 0 && (
                        <Chip variant="bright"
                              color="reassuring"
                              label={`Dependent: ${dependentUpdateList.join(', ')}`}
                              icon={<Link/>}/>
                    )}
                </TableBodyCell>
            )}
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
                    <ClusterDeploymentStatus clusterDeployment={bundle.clusterDeployment}
                                             bundleKey={`${bundle.symbolicName}/${bundle.version}`}/>
                </TableBodyCell>
            )}
            <TableBodyCell>
                <div className={styles.actionGroup} style={{width: 'fit-content'}}>
                    <Button variant="ghost"
                            size="default"
                            color="default"
                            label=""
                            icon={<Information/>}
                            title={t('label.showDetails')}
                            onClick={() => setOpen(true)}/>
                    {(bundle.state === 'INSTALLED' || bundle.state === 'RESOLVED') && (
                        <>
                            <Button variant="ghost"
                                    size="default"
                                    color="accent"
                                    label=""
                                    icon={<Power/>}
                                    title={t('label.startBundle')}
                                    onClick={handleStartBundle}/>
                            <Button variant="ghost"
                                    size="default"
                                    color="danger"
                                    label=""
                                    icon={<Delete/>}
                                    title={t('label.uninstallBundle')}
                                    onClick={handleUninstallBundle}/>
                        </>
                    )}
                    {bundle.state === 'ACTIVE' && (
                        <>
                            <Button variant="ghost"
                                    size="default"
                                    color="default"
                                    label=""
                                    icon={<Cancel/>}
                                    title={t('label.stopBundle')}
                                    onClick={handleStopBundle}/>
                            <Button variant="ghost"
                                    size="default"
                                    color="default"
                                    label=""
                                    icon={<Reload/>}
                                    title={t('label.refreshBundle')}
                                    onClick={handleRefreshBundle}/>
                            {updateAvailable && (
                                <Button variant="ghost"
                                        size="default"
                                        color="accent"
                                        label=""
                                        icon={<Upload/>}
                                        title={t('label.updateBundle')}
                                        onClick={() => handleUpdate(bundle.symbolicName)}/>
                            )}
                        </>
                    )}
                </div>
                <Dialog fullWidth open={open} maxWidth="lg" onClose={() => setOpen(false)}>
                    <BundleDetails bundle={bundle} close={setOpen} refetch={refetch}/>
                </Dialog>
            </TableBodyCell>
        </TableRow>
    );
});

ModuleRow.displayName = 'ModuleRow';

ModuleRow.propTypes = {
    module: PropTypes.shape({name: PropTypes.string, version: PropTypes.string}),
    updates: PropTypes.arrayOf(PropTypes.shape({name: PropTypes.string, version: PropTypes.string, available: PropTypes.string})),
    handleUpdate: PropTypes.func,
    dependentUpdates: PropTypes.func,
    isClustered: PropTypes.bool,
    refreshAllModules: PropTypes.func
};

export default ModuleRow;

