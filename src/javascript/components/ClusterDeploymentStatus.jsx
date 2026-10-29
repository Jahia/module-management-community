import React from 'react';
import {Badge} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import styles from './ModuleManagementCommunityApp.scss';

const ClusterDeploymentStatus = ({clusterDeployment, bundleKey}) => {
    if (!clusterDeployment || clusterDeployment.length === 0) {
        return <span className={styles.noClusterData}>No cluster data</span>;
    }

    const firstNodeState = clusterDeployment[0]?.bundles.find(b => b.key === bundleKey)?.state;
    const isConsistent = clusterDeployment.every(node =>
        node.bundles.find(b => b.key === bundleKey)?.state === firstNodeState
    );

    return (
        <div className={styles.clusterStatus}>
            {clusterDeployment.map(node => {
                const state = node.bundles.find(b => b.key === bundleKey)?.state;
                // Moonstone Badge has no warning color, so a node that differs from the others is accent.
                let color = state === 'ACTIVE' ? 'success' : 'danger';
                if (!isConsistent && state !== 'ACTIVE') {
                    color = 'accent';
                }

                // A11y B-017: include state as text in label, not colour alone
                return (
                    <Badge key={node.nodeId}
                           label={`${node.nodeId}: ${state || '?'}`}
                           color={color}
                           aria-label={`Node ${node.nodeId} — ${bundleKey} — ${state || 'unknown'}`}/>
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
