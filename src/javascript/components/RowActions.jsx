import React, {useCallback, useEffect, useRef, useState} from 'react';
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
import {useAnnounce} from './StatusAnnouncer';
import {TABLE_HEADING_ID} from './ids';

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
 * The actions follow the state that the row shows, which the installed modules poll keeps fresh;
 * the bundle gives only its id, type and name.
 */
const RowActions = ({bundle, state, refetch, refreshAllModules, hasUpdateAvailable, onUpdate}) => {
    const {t} = useTranslation('module-management-community');
    const notificationContext = useNotifications();
    const announce = useAnnounce();
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);
    const menu = useMenuButton();
    // A11y B-003: uninstall confirmation state
    const [confirmUninstall, setConfirmUninstall] = useState(false);
    // A dialog gives focus back to the button that opened it: a hover action, or the ⋮ button after a menu item.
    const dialogFocus = useReturnFocus(useCallback(
        () => menu.anchorRef.current && menu.anchorRef.current.querySelector('button'),
        [menu.anchorRef]
    ));

    // Start and Stop replace the pressed hover button by the other one, which drops focus to the page.
    // pendingFocus names the action that takes focus once the row shows the new state.
    const rootRef = useRef(null);
    const pendingFocus = useRef(null);
    const restoreFocus = useCallback(() => {
        const key = pendingFocus.current;
        const active = document.activeElement;
        if (!key || !rootRef.current || (active && active !== document.body && active.isConnected)) {
            return;
        }

        pendingFocus.current = null;
        const target = rootRef.current.querySelector(`[data-testid="row-action-${key}"]`) ||
            (menu.anchorRef.current && menu.anchorRef.current.querySelector('button'));
        if (target) {
            target.focus();
        }
    }, [menu.anchorRef]);
    useEffect(() => {
        restoreFocus();
        pendingFocus.current = null;
    }, [state, restoreFocus]);

    const variables = {bundleId: bundle.bundleId};
    const [stopBundle] = useMutation(STOP_MUTATION, {variables});
    const [startBundle] = useMutation(START_MUTATION, {variables});
    const [refreshBundle] = useMutation(REFRESH_MUTATION, {variables});
    const [uninstallBundle] = useMutation(UNINSTALL_MUTATION, {variables});

    const run = async (mutation, successKey, errorKey, {refetchRow = true, focusNext = null} = {}) => {
        pendingFocus.current = focusNext;
        try {
            await mutation();
            notificationContext.notify(t(successKey), ['closeButton', 'closeAfter5s']);
            announce(t(successKey));
            if (refetchRow) {
                await refetch();
            }

            await refreshAllModules();
            if (!refetchRow) {
                // The row of an uninstalled bundle unmounts with its buttons, so focus moves to the table heading.
                const heading = document.getElementById(TABLE_HEADING_ID);
                if (heading) {
                    heading.setAttribute('tabindex', '-1');
                    heading.focus();
                }
            }
        } catch (e) {
            console.error(`Error running ${successKey}:`, e);
            notificationContext.notify(t(errorKey), ['closeButton', 'closeAfter5s']);
            announce(t(errorKey));
        } finally {
            // The row usually shows the new state before the refresh resolves, and the effect on state moves focus.
            // A state that did not change, or a failure, leaves the pressed button in place.
            requestAnimationFrame(restoreFocus);
            setTimeout(() => {
                pendingFocus.current = null;
            }, 2000);
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
    const isInactive = state === 'INSTALLED' || state === 'RESOLVED';
    const isActive = state === 'ACTIVE';

    const actions = [
        {key: 'details', Icon: Information, label: t('label.showDetails'), onClick: () => openDialog(setIsDetailsOpen)},
        isNotBundleType && isInactive && {
            key: 'start', Icon: Power, label: t('label.startBundle'), color: 'accent',
            onClick: () => run(startBundle, 'label.startBundleSuccess', 'label.startBundleError', {focusNext: 'stop'})
        },
        isActive && isNotBundleType && {
            key: 'stop', Icon: Cancel, label: t('label.stopBundle'),
            onClick: () => run(stopBundle, 'label.stopBundleSuccess', 'label.stopBundleError', {focusNext: 'start'})
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
        <div ref={rootRef} className={styles.rowActions}>
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
                        aria-label={t('label.table.actions.menu', {name: bundle.symbolicName, interpolation: {escapeValue: false}})}
                        title={t('label.menu.more')}
                        aria-haspopup="menu"
                        aria-expanded={menu.isOpen}
                        data-testid="row-actions-menu-btn"
                        onKeyDown={menu.onButtonKeyDown}
                        onKeyUp={menu.onButtonKeyUp}
                        onClick={menu.toggle}/>
            </span>
            <AccessibleMenu isOpen={menu.isOpen}
                            initialFocus={menu.initialFocus}
                            anchorRef={menu.anchorRef}
                            label={t('label.table.actions.menu', {name: bundle.symbolicName, interpolation: {escapeValue: false}})}
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
                                 title={t('label.uninstall.confirm.title', {name: bundle.symbolicName, interpolation: {escapeValue: false}})}/>
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
                                    run(uninstallBundle, 'label.uninstallBundleSuccess', 'label.uninstallBundleError', {refetchRow: false});
                                }}/>
                    </ModalFooter>
                </>
            </Modal>
        </div>
    );
};

RowActions.propTypes = {
    bundle: PropTypes.object.isRequired,
    state: PropTypes.string,
    refetch: PropTypes.func.isRequired,
    refreshAllModules: PropTypes.func.isRequired,
    hasUpdateAvailable: PropTypes.bool.isRequired,
    onUpdate: PropTypes.func.isRequired
};

export default RowActions;
