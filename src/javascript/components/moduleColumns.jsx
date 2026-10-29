import React, {useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {Badge, Loader, Typography} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import {dependentUpdatesOf, useBundleRow} from '../hooks/useBundleRow';
import ClusterDeploymentStatus from './ClusterDeploymentStatus';
import RowActions from './RowActions';
import styles from './ModuleManagementCommunityApp.scss';

const stateColor = state => (state === 'ACTIVE' ? 'success' : 'danger');

const moduleShape = PropTypes.shape({
    name: PropTypes.string.isRequired,
    version: PropTypes.string.isRequired,
    state: PropTypes.string,
    type: PropTypes.string,
    available: PropTypes.string
});

const NameCell = ({module}) => {
    const {bundle} = useBundleRow(module);
    return (
        <Typography variant="body" className={styles.moduleName} title={module.name}>
            {module.name}
            {bundle && <Typography component="span" variant="caption" className={styles.bundleId}> [{bundle.bundleId}]</Typography>}
        </Typography>
    );
};

NameCell.propTypes = {module: moduleShape.isRequired};

const AvailableCell = ({module, updates}) => {
    const {t} = useTranslation('module-management-community');
    const {bundle} = useBundleRow(module);
    const dependents = dependentUpdatesOf(bundle, updates);
    return (
        <div className={styles.badges}>
            {module.available && <Badge label={module.available} color="success"/>}
            {dependents.length > 0 && (
                <Badge label={t('label.table.cells.dependent', {modules: dependents.join(', ')})}
                       color="accent"
                       title={dependents.join(', ')}/>
            )}
        </div>
    );
};

AvailableCell.propTypes = {
    module: moduleShape.isRequired,
    updates: PropTypes.array.isRequired
};

const StateCell = ({module, isClustered}) => {
    const {t} = useTranslation('module-management-community');
    const {bundle} = useBundleRow(module);
    const clusterState = isClustered ? bundle?.clusterState : undefined;
    return (
        <div className={styles.badges}>
            <Badge label={module.state} color={stateColor(module.state)}/>
            {clusterState && clusterState !== 'UNKNOWN' && (
                <Badge label={clusterState} color={stateColor(clusterState)} title={t('label.table.cells.clusterstate')}/>
            )}
            {clusterState === 'UNKNOWN' && (
                <Badge label={t('label.cluster.state.not.sync.short')}
                       color="accent"
                       title={t('label.cluster.state.not.sync.long')}/>
            )}
        </div>
    );
};

StateCell.propTypes = {
    module: moduleShape.isRequired,
    isClustered: PropTypes.bool.isRequired
};

const ClusterNodesCell = ({module}) => {
    const {bundle, loading} = useBundleRow(module);
    if (!bundle) {
        return loading ? <Loader size="small"/> : null;
    }

    return (
        <ClusterDeploymentStatus clusterDeployment={bundle.clusterDeployment}
                                 bundleKey={`${bundle.symbolicName}/${bundle.version}`}/>
    );
};

ClusterNodesCell.propTypes = {module: moduleShape.isRequired};

const ActionsCell = ({module, updates, onDependentUpdates, onUpdate, refreshAllModules}) => {
    const {t} = useTranslation('module-management-community');
    const {bundle, error, loading, refetch} = useBundleRow(module);

    // The parent needs the dependent updates of a row for the updates filter and for Update all.
    useEffect(() => {
        const dependents = dependentUpdatesOf(bundle, updates);
        if (bundle && dependents.length > 0) {
            onDependentUpdates(bundle.symbolicName, dependents);
        }
    }, [bundle, updates, onDependentUpdates]);

    if (error) {
        return <Typography variant="caption">{t('label.errors.loadingModuleData')}</Typography>;
    }

    if (!bundle) {
        // A11y A-010: announce row-level loading state
        return loading ? <span role="status" aria-label={t('label.loading')}><Loader size="small"/></span> : null;
    }

    return (
        <RowActions bundle={bundle}
                    refetch={refetch}
                    refreshAllModules={refreshAllModules}
                    hasUpdateAvailable={Boolean(module.available)}
                    onUpdate={onUpdate}/>
    );
};

ActionsCell.propTypes = {
    module: moduleShape.isRequired,
    updates: PropTypes.array.isRequired,
    onDependentUpdates: PropTypes.func.isRequired,
    onUpdate: PropTypes.func.isRequired,
    refreshAllModules: PropTypes.func.isRequired
};

/** The DataTable columns of the modules table. The Available and Cluster columns show only when they hold data. */
export const buildModuleColumns = ({t, updates, isClustered, onDependentUpdates, onUpdate, refreshAllModules}) => [
    {
        key: 'name',
        label: t('label.table.cells.name'),
        isSortable: true,
        render: ({data}) => <NameCell module={data}/>
    },
    {
        key: 'type',
        label: t('label.table.cells.type'),
        isSortable: true,
        width: '140px',
        render: ({value}) => <Typography variant="body">{value}</Typography>
    },
    {
        key: 'version',
        label: t('label.table.cells.version'),
        isSortable: true,
        width: '180px',
        render: ({value}) => <Typography variant="body">{value}</Typography>
    },
    updates.length > 0 && {
        key: 'available',
        label: t('label.table.cells.available'),
        isSortable: true,
        width: '240px',
        render: ({data}) => <AvailableCell module={data} updates={updates}/>
    },
    {
        key: 'state',
        label: isClustered ? t('label.table.cells.clusterstate') : t('label.table.cells.state'),
        isSortable: true,
        width: '200px',
        render: ({data}) => <StateCell module={data} isClustered={isClustered}/>
    },
    isClustered && {
        key: 'clusterNodes',
        label: t('label.table.cells.cluster.nodes.state'),
        width: '400px',
        isScrollable: true,
        render: ({data}) => <ClusterNodesCell module={data}/>
    },
    {
        key: 'actions',
        label: t('label.table.actions.title'),
        width: '240px',
        align: 'right',
        render: ({data}) => (
            <ActionsCell module={data}
                         updates={updates}
                         refreshAllModules={refreshAllModules}
                         onDependentUpdates={onDependentUpdates}
                         onUpdate={onUpdate}/>
        )
    }
].filter(Boolean);
