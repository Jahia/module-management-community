import React from 'react';
import {Chip, Information} from '@jahia/moonstone';
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

    const firstNodeKey = clusterDeployment[0]?.bundles.find(b => b.key === bundleKey)?.key;
    const isVersionConsistent = clusterDeployment.every(node =>
        node.bundles.find(b => b.key === bundleKey)?.key === firstNodeKey
    );

    return (
        <div className={styles.clusterStatus}>
            {clusterDeployment.map(node => {
                const state = node.bundles.find(b => b.key === bundleKey)?.state;
                let color = state === 'ACTIVE' ? 'success' : 'danger';
                if (!isConsistent && state !== 'ACTIVE') {
                    color = 'warning';
                }

                return (
                    <div key={node.nodeId} className={styles.clusterNode}>
                        <Chip
                            variant={!isVersionConsistent ? 'outlined' : 'bright'}
                            label={node.nodeId}
                            color={color}
                            icon={!isVersionConsistent ? <Information/> : null}
                            title={`${node.bundles.find(b => b.key === bundleKey)?.key} - ${state}`}
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
    })),
    bundleKey: PropTypes.string
};

export default ClusterDeploymentStatus;

