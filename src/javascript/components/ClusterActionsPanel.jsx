import React from 'react';
import * as PropTypes from 'prop-types';
import {Button, Download, Reload, Typography, Upload} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './ModuleManagementCommunityApp.scss';

/**
 * Cluster synchronisation action buttons (Sync / Push / Pull).
 * Only rendered when the Jahia instance is running in clustered mode.
 */
export const ClusterActionsPanel = ({onOperation}) => {
    const {t} = useTranslation('module-management-community');

    return (
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
                    onClick={() => onOperation('synchronize')}/>
            <Button variant="outlined"
                    size="big"
                    color="danger"
                    label={t('label.table.actions.push')}
                    icon={<Upload/>}
                    className={`${styles.button} ${styles.fixedWidthButton}`}
                    onClick={() => onOperation('push')}/>
            <Button variant="outlined"
                    size="big"
                    color="danger"
                    label={t('label.table.actions.pull')}
                    icon={<Download/>}
                    className={`${styles.button} ${styles.fixedWidthButton}`}
                    onClick={() => onOperation('pull')}/>
        </div>
    );
};

ClusterActionsPanel.propTypes = {
    onOperation: PropTypes.func.isRequired
};

