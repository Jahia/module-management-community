import React, {useCallback, useState} from 'react';
import {useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {useNotifications} from '@jahia/react-material';
import {
    Button,
    Cancel,
    Delete,
    Information,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    MoreVert,
    Power,
    Reload,
    Typography,
    Upload
} from '@jahia/moonstone';
import * as PropTypes from 'prop-types';
import {ActionMenuItem} from './menu/MenuItems';
import {AccessibleMenu} from './menu/AccessibleMenu';
import BundleDetailsDialog from './BundleDetailsDialog';
import styles from './ModuleManagementCommunityApp.scss';
import menuStyles from './menu/menus.scss';
import {useMenuButton, useReturnFocus} from '../hooks/useMenuButton';

const STOP_MUTATION = gql`mutation ($bundleId: Long!) {
    admin { modulesManagement { bundle(bundleId: $bundleId) { stop } } }
}`;
const START_MUTATION = gql`mutation ($bundleId: Long!) {
    admin { modulesManagement { bundle(bundleId: $bundleId) { start } } }
}`;
const REFRESH_MUTATION = gql`mutation ($bundleId: Long!) {
    admin { modulesManagement { bundle(bundleId: $bundleId) { refresh } } }
}`;
const UNINSTALL_MUTATION = gql`mutation ($bundleId: Long!) {
    admin { modulesManagement { bundle(bundleId: $bundleId) { uninstall } } }
}`;

/**
 * The actions of one bundle: icon buttons that show while the pointer is on the row,
 * and a ⋮ menu that lists the same actions with their labels.
 */
const RowActions = ({bundle, refetch, refreshAllModules, hasUpdateAvailable, onUpdate}) => {
    const {t} = useTranslation('module-management-community');
    const notificationContext = useNotifications();
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const menu = useMenuButton();
    // A11y B-003: uninstall confirmation state
    const [confirmUninstall, setConfirmUninstall] = useState(false);
    // A dialog gives focus back to the button that opened it: a hover action, or the ⋮ button after a menu item.
    const dialogFocus = useReturnFocus(useCallback(
        () => menu.anchorRef.current && menu.anchorRef.current.querySelector('button'),
        [menu.anchorRef]
    ));

    const variables = {bundleId: bundle.bundleId};
    const [stopBundle] = useMutation(STOP_MUTATION, {variables});
    const [startBundle] = useMutation(START_MUTATION, {variables});
    const [refreshBundle] = useMutation(REFRESH_MUTATION, {variables});
    const [uninstallBundle] = useMutation(UNINSTALL_MUTATION, {variables});

    const run = async (mutation, successKey, errorKey, refetchRow = true) => {
        try {
            await mutation();
            notificationContext.notify(t(successKey), ['closeButton', 'closeAfter5s']);
            if (refetchRow) {
                await refetch();
            }

            await refreshAllModules();
        } catch (e) {
            console.error(`Error running ${successKey}:`, e);
            notificationContext.notify(t(errorKey), ['closeButton', 'closeAfter5s']);
        }
    };

    const openDialog = setOpen => {
        dialogFocus.remember();
        setOpen(true);
    };

    const closeDialog = setOpen => {
        setOpen(false);
        dialogFocus.restore();
    };

    const isNotBundleType = bundle.type !== 'bundle';
    const isInactive = bundle.state === 'INSTALLED' || bundle.state === 'RESOLVED';
    const isActive = bundle.state === 'ACTIVE';

    const actions = [
        {key: 'details', Icon: Information, label: t('label.showDetails'), onClick: () => openDialog(setIsDetailsOpen)},
        isNotBundleType && isInactive && {
            key: 'start', Icon: Power, label: t('label.startBundle'), color: 'accent',
            onClick: () => run(startBundle, 'label.startBundleSuccess', 'label.startBundleError')
        },
        isActive && isNotBundleType && {
            key: 'stop', Icon: Cancel, label: t('label.stopBundle'),
            onClick: () => run(stopBundle, 'label.stopBundleSuccess', 'label.stopBundleError')
        },
        isActive && {
            key: 'refresh', Icon: Reload, label: t('label.refreshBundle'),
            onClick: () => run(refreshBundle, 'label.refreshBundleSuccess', 'label.refreshBundleError')
        },
        isActive && isNotBundleType && hasUpdateAvailable && {
            key: 'update', Icon: Upload, label: t('label.updateBundle'), color: 'accent',
            onClick: () => onUpdate(bundle.symbolicName)
        },
        isNotBundleType && isInactive && {
            key: 'uninstall', Icon: Delete, label: t('label.uninstallBundle'), color: 'danger',
            onClick: () => openDialog(setConfirmUninstall)
        }
    ].filter(Boolean);

    return (
        <div className={styles.rowActions}>
            <div className={styles.hoverActions} data-testid="row-hover-actions">
                {actions.map(({key, Icon, label, color, onClick}) => (
                    <Button key={key}
                            variant="ghost"
                            className={color === 'danger' ? menuStyles.dangerButton : undefined}
                            color={color || 'default'}
                            icon={<Icon/>}
                            aria-label={label}
                            title={label}
                            data-testid={`row-action-${key}`}
                            onClick={onClick}/>
                ))}
            </div>
            <span ref={menu.anchorRef} className={styles.menuAnchor}>
                <Button variant="ghost"
                        icon={<MoreVert/>}
                        aria-label={t('label.table.actions.menu', {name: bundle.symbolicName})}
                        title={t('label.menu.more')}
                        aria-haspopup="menu"
                        aria-expanded={menu.isOpen}
                        data-testid="row-actions-menu-btn"
                        onKeyDown={menu.onButtonKeyDown}
                        onClick={menu.toggle}/>
            </span>
            <AccessibleMenu isOpen={menu.isOpen}
                            initialFocus={menu.initialFocus}
                            anchorRef={menu.anchorRef}
                            label={t('label.table.actions.menu', {name: bundle.symbolicName})}
                            anchorElOrigin={{horizontal: 'right', vertical: 'bottom'}}
                            transformElOrigin={{horizontal: 'right', vertical: 'top'}}
                            data-testid="row-actions-menu"
                            onClose={menu.close}
            >
                {actions.map(({key, Icon, label, onClick}) => (
                    <ActionMenuItem key={key}
                                    label={label}
                                    iconStart={<Icon/>}
                                    tabIndex={-1}
                                    data-testid={`row-menu-${key}`}
                                    onClick={() => {
                                        // Focus goes back to the ⋮ button first, so a dialog opened next remembers it.
                                        menu.close();
                                        onClick();
                                    }}/>
                ))}
            </AccessibleMenu>

            {isDetailsOpen && (
                <BundleDetailsDialog isOpen
                                     name={bundle.symbolicName}
                                     version={bundle.version}
                                     onClose={() => closeDialog(setIsDetailsOpen)}
                                     onChange={refetch}/>
            )}

            {/* A11y B-003: alertdialog for the destructive prompt, labelled by its title. */}
            <Modal isOpen={confirmUninstall}
                   size="small"
                   role="alertdialog"
                   aria-labelledby={`uninstall-confirm-title-${bundle.bundleId}`}
                   aria-describedby={`uninstall-confirm-desc-${bundle.bundleId}`}
                   data-testid="uninstall-confirm-dialog"
                   onOpenChange={open => !open && closeDialog(setConfirmUninstall)}
            >
                <>
                    <ModalHeader id={`uninstall-confirm-title-${bundle.bundleId}`}
                                 title={t('label.uninstall.confirm.title', {name: bundle.symbolicName})}/>
                    <ModalBody id={`uninstall-confirm-desc-${bundle.bundleId}`}>
                        <Typography variant="body">
                            {t('label.uninstall.confirm.message')}
                        </Typography>
                    </ModalBody>
                    <ModalFooter>
                        <Button variant="ghost"
                                size="big"
                                label={t('label.cancel')}
                                onClick={() => closeDialog(setConfirmUninstall)}/>
                        <Button variant="default"
                                size="big"
                                color="danger"
                                className={menuStyles.dangerButton}
                                label={t('label.uninstallBundle')}
                                onClick={() => {
                                    closeDialog(setConfirmUninstall);
                                    run(uninstallBundle, 'label.uninstallBundleSuccess', 'label.uninstallBundleError', false);
                                }}/>
                    </ModalFooter>
                </>
            </Modal>
        </div>
    );
};

RowActions.propTypes = {
    bundle: PropTypes.object.isRequired,
    refetch: PropTypes.func.isRequired,
    refreshAllModules: PropTypes.func.isRequired,
    hasUpdateAvailable: PropTypes.bool.isRequired,
    onUpdate: PropTypes.func.isRequired
};

export default RowActions;
