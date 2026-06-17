import React, {useState} from 'react';
import {useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {Button, Cancel, Delete, Information, Power, Reload, Upload} from '@jahia/moonstone';
import {Dialog} from '@material-ui/core';
import * as PropTypes from 'prop-types';
import styles from './ModuleManagementCommunityApp.scss';
import BundleDetails from './BundleDetails';

const BundleActions = ({bundle, refetch, refreshAllModules, hasUpdateAvailable, onUpdate}) => {
    const {t} = useTranslation('module-management-community');
    const notificationContext = useNotifications();
    const [open, setOpen] = useState(false);

    const {bundleId} = bundle;

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

    const handleStop = async () => {
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

    const handleStart = async () => {
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

    const handleRefresh = async () => {
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

    const handleUninstall = async () => {
        try {
            await uninstallBundle();
            notificationContext.notify(t('label.uninstallBundleSuccess'), ['closeButton', 'closeAfter5s']);
            await refreshAllModules();
        } catch (e) {
            console.error('Error uninstalling bundle:', e);
            notificationContext.notify(t('label.uninstallBundleError'), ['closeButton', 'closeAfter5s']);
        }
    };

    const isNotBundleType = bundle.type !== 'bundle';
    const isInactive = bundle.state === 'INSTALLED' || bundle.state === 'RESOLVED';
    const isActive = bundle.state === 'ACTIVE';

    return (
        <>
            <div className={styles.actionGroup} style={{width: 'fit-content'}}>
                <Button variant="ghost"
                        size="default"
                        color="default"
                        label=""
                        icon={<Information/>}
                        title={t('label.showDetails')}
                        onClick={() => setOpen(true)}/>

                {isNotBundleType && isInactive && (
                    <>
                        <Button variant="ghost"
                                size="default"
                                color="accent"
                                label=""
                                icon={<Power/>}
                                title={t('label.startBundle')}
                                onClick={handleStart}/>
                        <Button variant="ghost"
                                size="default"
                                color="danger"
                                label=""
                                icon={<Delete/>}
                                title={t('label.uninstallBundle')}
                                onClick={handleUninstall}/>
                    </>
                )}

                {isActive && (
                    <>
                        {isNotBundleType && (
                            <Button variant="ghost"
                                    size="default"
                                    color="default"
                                    label=""
                                    icon={<Cancel/>}
                                    title={t('label.stopBundle')}
                                    onClick={handleStop}/>
                        )}
                        <Button variant="ghost"
                                size="default"
                                color="default"
                                label=""
                                icon={<Reload/>}
                                title={t('label.refreshBundle')}
                                onClick={handleRefresh}/>
                        {isNotBundleType && hasUpdateAvailable && (
                            <Button variant="ghost"
                                    size="default"
                                    color="accent"
                                    label=""
                                    icon={<Upload/>}
                                    title={t('label.updateBundle')}
                                    onClick={() => onUpdate(bundle.symbolicName)}/>
                        )}
                    </>
                )}
            </div>

            <Dialog fullWidth open={open} maxWidth="lg" data-testid="bundle-details-dialog" onClose={() => setOpen(false)}>
                <BundleDetails bundle={bundle} close={setOpen} refetch={refetch}/>
            </Dialog>
        </>
    );
};

BundleActions.propTypes = {
    bundle: PropTypes.object.isRequired,
    refetch: PropTypes.func.isRequired,
    refreshAllModules: PropTypes.func.isRequired,
    hasUpdateAvailable: PropTypes.bool.isRequired,
    onUpdate: PropTypes.func.isRequired
};

export default BundleActions;

