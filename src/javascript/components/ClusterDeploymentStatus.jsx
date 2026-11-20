import React from 'react';
import {useTranslation} from 'react-i18next';
import * as PropTypes from 'prop-types';
import {stateLabel, stateTone} from '../utils/moduleStates';
import StatusDot from './StatusDot';
import styles from './ModuleManagementCommunityApp.scss';

/** One line for each cluster node: the state of the bundle on that node, then the name of the node. */
const ClusterDeploymentStatus = ({clusterDeployment, bundleKey}) => {
    const {t} = useTranslation('module-management-community');
    if (!clusterDeployment || clusterDeployment.length === 0) {
        return <span className={styles.noClusterData}>{t('label.cluster.noData')}</span>;
    }

    return (
        <div className={styles.clusterStatus}>
            {clusterDeployment.map(node => {
                const state = node.bundles.find(b => b.key === bundleKey)?.state;
                return (
                    <StatusDot key={node.nodeId} tone={stateTone(state)} variant="caption">
                        <span className={styles.nodeState}>{stateLabel(t, state)}</span>
                        {node.nodeId}
                    </StatusDot>
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
    })),
    bundleKey: PropTypes.string
};

export default ClusterDeploymentStatus;
