import React, {memo, useEffect} from 'react';
import {useQuery} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {
    Badge,
    Chip,
    Information,
    Link,
    Loader,
    Rocket,
    TableBodyCell,
    TableRow,
    Typography
} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import styles from './ModuleManagementCommunityApp.scss';
import ClusterDeploymentStatus from './ClusterDeploymentStatus';
import BundleActions from './BundleActions';

const BUNDLE_QUERY = gql`query ($module: String!, $version: String!) {
    admin {
        modulesManagement {
            bundle(name: $module, version: $version) {
                symbolicName bundleId state version type
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
                previousVersions { version jcrPath fileName size lastModified }
            }
        }
    }
}`;

const BUNDLE_TYPE_COLOR = {
    module: 'success',
    templatesSet: 'success',
    system: 'accent',
    bundle: 'accent'
};

const ModuleRow = memo(({module, updates, handleUpdate, dependentUpdates, reportType, isClustered, refreshAllModules}) => {
    const {t} = useTranslation('module-management-community');

    const {data, error, loading, refetch} = useQuery(BUNDLE_QUERY, {
        fetchPolicy: 'cache-and-network',
        variables: {module: module.name, version: module.version}
    });

    useEffect(() => {
        const bundle = data?.admin?.modulesManagement?.bundle;
        if (bundle !== undefined) {
            // Report bundle type back to parent for app-level filtering
            if (reportType && bundle.type) {
                reportType(bundle.symbolicName, bundle.type);
            }

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
    }, [data, updates, dependentUpdates, reportType]);

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
                <Badge label={bundle.type || 'bundle'}
                       color={BUNDLE_TYPE_COLOR[bundle.type] || 'accent'}/>
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
                <BundleActions bundle={bundle}
                               refetch={refetch}
                               refreshAllModules={refreshAllModules}
                               hasUpdateAvailable={updateAvailable}
                               onUpdate={handleUpdate}/>
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
    reportType: PropTypes.func,
    isClustered: PropTypes.bool,
    refreshAllModules: PropTypes.func
};

export default ModuleRow;

