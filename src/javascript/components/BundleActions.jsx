import React, {useState} from 'react';
import {useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {Button, Cancel, Delete, Information, Power, Reload, Typography, Upload} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import * as PropTypes from 'prop-types';
import styles from './ModuleManagementCommunityApp.scss';
import BundleDetails from './BundleDetails';

const BundleActions = ({bundle, refetch, refreshAllModules, hasUpdateAvailable, onUpdate}) => {
    const {t} = useTranslation('module-management-community');
    const notificationContext = useNotifications();
    const [open, setOpen] = useState(false);
    // A11y B-003: uninstall confirmation state
    const [confirmUninstall, setConfirmUninstall] = useState(false);

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
                {/* A11y A-003: aria-label instead of empty label + title */}
                <Button variant="ghost"
                        size="default"
                        color="default"
                        label=""
                        icon={<Information/>}
                        aria-label={t('label.showDetails')}
                        onClick={() => setOpen(true)}/>

                {isNotBundleType && isInactive && (
                    <>
                        <Button variant="ghost"
                                size="default"
                                color="accent"
                                label=""
                                icon={<Power/>}
                                aria-label={t('label.startBundle')}
                                onClick={handleStart}/>
                        {/* A11y B-003: show confirm dialog instead of immediate uninstall */}
                        <Button variant="ghost"
                                size="default"
                                color="danger"
                                label=""
                                icon={<Delete/>}
                                aria-label={t('label.uninstallBundle')}
                                onClick={() => setConfirmUninstall(true)}/>
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
                                    aria-label={t('label.stopBundle')}
                                    onClick={handleStop}/>
                        )}
                        <Button variant="ghost"
                                size="default"
                                color="default"
                                label=""
                                icon={<Reload/>}
                                aria-label={t('label.refreshBundle')}
                                onClick={handleRefresh}/>
                        {isNotBundleType && hasUpdateAvailable && (
                            <Button variant="ghost"
                                    size="default"
                                    color="accent"
                                    label=""
                                    icon={<Upload/>}
                                    aria-label={t('label.updateBundle')}
                                    onClick={() => onUpdate(bundle.symbolicName)}/>
                        )}
                    </>
                )}
            </div>

            {/* A11y A-011: Dialog with aria-labelledby pointing to bundle title */}
            <Dialog fullWidth
                    open={open}
                    maxWidth="lg"
                    aria-labelledby="bundle-details-title"
                    data-testid="bundle-details-dialog"
                    PaperProps={{'aria-modal': 'true'}}
                    onClose={() => setOpen(false)}
            >
                <BundleDetails bundle={bundle}
                               close={setOpen}
                               refetch={refetch}/>
            </Dialog>

            {/* A11y B-003: Uninstall confirmation dialog.
                alertdialog + aria-modal for a destructive prompt; dangerScope darkens
                the confirm button's red to meet contrast. */}
            <Dialog open={confirmUninstall}
                    aria-labelledby="uninstall-confirm-title"
                    aria-describedby="uninstall-confirm-desc"
                    PaperProps={{role: 'alertdialog', 'aria-modal': 'true', className: styles.dangerScope}}
                    onClose={() => setConfirmUninstall(false)}
            >
                <DialogTitle id="uninstall-confirm-title">
                    {t('label.uninstall.confirm.title', {
                        name: bundle.symbolicName,
                        defaultValue: `Uninstall ${bundle.symbolicName}?`
                    })}
                </DialogTitle>
                <DialogContent id="uninstall-confirm-desc">
                    <Typography variant="body">
                        {t('label.uninstall.confirm.message', {
                            defaultValue: 'This will permanently uninstall the bundle. Are you sure?'
                        })}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button variant="ghost"
                            size="big"
                            label={t('label.cancel')}
                            onClick={() => setConfirmUninstall(false)}/>
                    <Button variant="default"
                            size="big"
                            color="danger"
                            label={t('label.uninstallBundle')}
                            onClick={() => {
                                setConfirmUninstall(false);
                                handleUninstall();
                            }}/>
                </DialogActions>
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
