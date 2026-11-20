import React, {useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {Chip, Loader, Typography} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import {dependentUpdatesOf, useBundleRow} from '../hooks/useBundleRow';
import {stateLabel, stateTone, typeLabel} from '../utils/moduleStates';
import ClusterDeploymentStatus from './ClusterDeploymentStatus';
import RowActions from './RowActions';
import StatusDot from './StatusDot';
import styles from './ModuleManagementCommunityApp.scss';

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
            {module.available && <Chip label={module.available} color="accent"/>}
            {dependents.length > 0 && (
                <Chip label={t('label.table.cells.dependent', {modules: dependents.join(', ')})} color="accent"/>
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
    // The cluster state shows only when it differs from the state of this node.
    return (
        <div className={styles.states}>
            <StatusDot tone={stateTone(module.state)}>{stateLabel(t, module.state)}</StatusDot>
            {clusterState && clusterState !== 'UNKNOWN' && clusterState !== module.state && (
                <StatusDot tone={stateTone(clusterState)}>
                    <span className={styles.srOnly}>{t('label.table.cells.clusterStatePrefix')} </span>
                    {stateLabel(t, clusterState)}
                </StatusDot>
            )}
            {clusterState === 'UNKNOWN' && (
                <>
                    <Chip label={t('label.cluster.state.not.sync.short')}
                          color="accent"
                          title={t('label.cluster.state.not.sync.long')}/>
                    <span className={styles.srOnly}>{t('label.cluster.state.not.sync.long')}</span>
                </>
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
        // The table carries aria-busy and the page has one status message, so the Loader of a cell stays silent.
        return loading ? <Loader size="small" role="presentation" aria-hidden="true"/> : null;
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
    // An empty list is reported too, so a row leaves the map once its dependency is updated.
    useEffect(() => {
        if (bundle) {
            onDependentUpdates(bundle.symbolicName, dependentUpdatesOf(bundle, updates));
        }
    }, [bundle, updates, onDependentUpdates]);

    if (error) {
        return <Typography variant="caption">{t('label.errors.loadingModuleData')}</Typography>;
    }

    if (!bundle) {
        return loading ? <Loader size="small" role="presentation" aria-hidden="true"/> : null;
    }

    return (
        <RowActions bundle={bundle}
                    state={module.state}
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

/**
 * The label of a sortable column header: a button, as the DataTable header cell answers only a mouse click.
 * Its name gives the column, the sort state and what a press does; the header cell carries aria-sort.
 */
const SortButton = ({columnKey, label, sortBy, sortDirection, onSort}) => {
    const {t} = useTranslation('module-management-community');
    const isActive = sortBy === columnKey;
    const next = isActive && sortDirection === 'ascending' ? 'descending' : 'ascending';
    const name = t(isActive ? `label.table.sort.${sortDirection}` : 'label.table.sort.none', {
        column: label,
        interpolation: {escapeValue: false}
    });
    return (
        <button type="button"
                className={styles.sortButton}
                aria-label={name}
                data-testid="sort-button"
                data-column={columnKey}
                onClick={event => {
                    // The header cell would toggle the sort a second time.
                    event.stopPropagation();
                    onSort(columnKey, next);
                }}
        >
            {label}
        </button>
    );
};

SortButton.propTypes = {
    columnKey: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    sortBy: PropTypes.string.isRequired,
    sortDirection: PropTypes.oneOf(['ascending', 'descending']).isRequired,
    onSort: PropTypes.func.isRequired
};

/** The DataTable columns of the modules table. The Available and Cluster columns show only when they hold data. */
export const buildModuleColumns = ({t, updates, isClustered, sort, onDependentUpdates, onUpdate, refreshAllModules}) => [
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
        render: ({value}) => <Typography variant="body">{typeLabel(t, value)}</Typography>
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
        width: '300px',
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
].filter(Boolean).map(column => (column.isSortable ? {
    ...column,
    label: <SortButton columnKey={column.key} label={column.label} {...sort}/>
} : column));
