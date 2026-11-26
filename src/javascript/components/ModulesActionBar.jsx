import React, {useId, useState} from 'react';
import * as PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Close, CloudDownload, MoreVert, Reload, Upload} from '@jahia/moonstone';
import {ActionMenuItem, CheckMenuItem} from './menu/MenuItems';
import {AccessibleMenu, MenuGroup} from './menu/AccessibleMenu';
import {isNonDefault, UpdateOptionsPopover} from './UpdateOptionsPopover';
import styles from './ModuleManagementCommunityApp.scss';
import menuStyles from './menu/menus.scss';
import {useMenuButton, useReturnFocus} from '../hooks/useMenuButton';

const CLUSTER_OPERATIONS = [
    {key: 'synchronize', labelKey: 'label.table.actions.sync'},
    {key: 'push', labelKey: 'label.table.actions.push'},
    {key: 'pull', labelKey: 'label.table.actions.pull'}
];

/**
 * The action bar of the modules screen: the frequent actions as buttons, and every other action in a ⋮ menu.
 */
export const ModulesActionBar = ({
    isLoading,
    isFiltered,
    isClustered,
    hasUpdates,
    lastUpdate,
    preferences,
    onPreferencesChange,
    onRefresh,
    onClearFilters,
    onUpload,
    onInstallFromStore,
    onUpdateAll,
    onExport,
    onGenerateScript,
    onCleanupJcr,
    onClusterOperation
}) => {
    const {t} = useTranslation('module-management-community');
    const menu = useMenuButton();
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const optionsFocus = useReturnFocus(menu.getButton);
    const lastUpdateId = useId();

    // Each menu action closes the menu, which gives focus back to the ⋮ button, before it runs.
    // A dialog that the action opens then returns focus to that button when it closes.
    const fromMenu = action => () => {
        menu.close();
        action();
    };

    const openOptions = () => {
        optionsFocus.remember();
        setIsOptionsOpen(true);
    };

    const closeOptions = () => {
        setIsOptionsOpen(false);
        optionsFocus.restore();
    };

    // The button stays enabled while loading, so it keeps focus during a poll; a click then does nothing.
    const handleRefresh = () => {
        if (!isLoading) {
            onRefresh();
        }
    };

    const updateMode = preferences.dryRun ? t('label.updateAllBadgeDry') : t('label.updateAllBadgeLive');
    const lastUpdateText = lastUpdate ? t('label.lastUpdate', {date: lastUpdate, interpolation: {escapeValue: false}}) : undefined;

    return (
        <>
            <Button variant="ghost"
                    icon={<Reload/>}
                    label={t('label.refresh')}
                    title={lastUpdateText}
                    aria-describedby={lastUpdateText ? lastUpdateId : undefined}
                    aria-busy={isLoading || undefined}
                    data-testid="refresh-btn"
                    onClick={handleRefresh}/>
            {lastUpdateText && <span id={lastUpdateId} className={menuStyles.srOnly}>{lastUpdateText}</span>}
            <Button variant="ghost"
                    icon={<Upload/>}
                    label={t('label.upload.module')}
                    data-testid="upload-module-btn"
                    onClick={onUpload}/>
            <Button variant="ghost"
                    icon={<CloudDownload/>}
                    label={t('label.installFromStore.menuItem')}
                    data-testid="install-from-store-btn"
                    onClick={onInstallFromStore}/>
            <Button variant="ghost"
                    icon={<Close/>}
                    label={t('label.filters.clear')}
                    isDisabled={!isFiltered}
                    data-testid="filter-clear"
                    onClick={onClearFilters}/>
            <span ref={menu.anchorRef} className={styles.menuAnchor}>
                <Button variant="ghost"
                        icon={<MoreVert/>}
                        aria-label={t('label.menu.more')}
                        title={t('label.menu.more')}
                        aria-haspopup="menu"
                        aria-expanded={menu.isOpen}
                        data-testid="more-actions-btn"
                        onKeyDown={menu.onButtonKeyDown}
                        onKeyUp={menu.onButtonKeyUp}
                        onClick={menu.toggle}/>
            </span>
            <AccessibleMenu isOpen={menu.isOpen}
                            initialFocus={menu.initialFocus}
                            anchorRef={menu.anchorRef}
                            label={t('label.menu.more')}
                            minWidth="260px"
                            data-testid="more-actions-menu"
                            onClose={menu.close}
            >
                <MenuGroup title={t('label.menu.section.updates')}>
                    <ActionMenuItem isDescriptionHidden
                                    label={`${t('label.updateAll')} (${updateMode})`}
                                    description={preferences.dryRun ? t('label.updateAllDryRunTooltip') : t('label.updateAllLiveTooltip')}
                                    title={preferences.dryRun ? t('label.updateAllDryRunTooltip') : t('label.updateAllLiveTooltip')}
                                    isDisabled={!hasUpdates}
                                    tabIndex={-1}
                                    data-testid="update-all-btn"
                                    onClick={fromMenu(onUpdateAll)}/>
                    <ActionMenuItem label={isNonDefault(preferences) ? t('label.menu.updateOptionsModified') : t('label.menu.updateOptions')}
                                    tabIndex={-1}
                                    data-testid="update-options-btn"
                                    onClick={fromMenu(openOptions)}/>
                    <CheckMenuItem label={t('label.autoRefresh.menu')}
                                   isChecked={preferences.autoRefresh}
                                   tabIndex={-1}
                                   data-testid="auto-refresh-toggle"
                                   onToggle={() => onPreferencesChange({...preferences, autoRefresh: !preferences.autoRefresh})}/>
                </MenuGroup>
                <MenuGroup title={t('label.menu.section.modules')}>
                    <ActionMenuItem label={t('label.export.snapshot')}
                                    tabIndex={-1}
                                    data-testid="export-snapshot-btn"
                                    onClick={fromMenu(onExport)}/>
                    <ActionMenuItem label={t('label.generateScript.menuItem')}
                                    tabIndex={-1}
                                    data-testid="generate-script-btn"
                                    onClick={fromMenu(onGenerateScript)}/>
                    <ActionMenuItem label={t('label.cleanup.jcr')}
                                    description={t('label.cleanup.jcrDescription')}
                                    tabIndex={-1}
                                    data-testid="cleanup-jcr-btn"
                                    onClick={fromMenu(onCleanupJcr)}/>
                </MenuGroup>
                {isClustered && (
                    <MenuGroup title={t('label.cluster.ops.title')}>
                        {CLUSTER_OPERATIONS.map(({key, labelKey}) => (
                            <ActionMenuItem key={key}
                                            label={t(labelKey)}
                                            tabIndex={-1}
                                            data-testid={`cluster-${key}-btn`}
                                            onClick={fromMenu(() => onClusterOperation(key))}/>
                        ))}
                    </MenuGroup>
                )}
            </AccessibleMenu>
            <UpdateOptionsPopover preferences={preferences}
                                  isOpen={isOptionsOpen}
                                  onPreferencesChange={onPreferencesChange}
                                  onClose={closeOptions}/>
        </>
    );
};

ModulesActionBar.propTypes = {
    isLoading: PropTypes.bool.isRequired,
    isFiltered: PropTypes.bool.isRequired,
    isClustered: PropTypes.bool.isRequired,
    hasUpdates: PropTypes.bool.isRequired,
    lastUpdate: PropTypes.string,
    preferences: PropTypes.object.isRequired,
    onPreferencesChange: PropTypes.func.isRequired,
    onRefresh: PropTypes.func.isRequired,
    onClearFilters: PropTypes.func.isRequired,
    onUpload: PropTypes.func.isRequired,
    onInstallFromStore: PropTypes.func.isRequired,
    onUpdateAll: PropTypes.func.isRequired,
    onExport: PropTypes.func.isRequired,
    onGenerateScript: PropTypes.func.isRequired,
    onCleanupJcr: PropTypes.func.isRequired,
    onClusterOperation: PropTypes.func.isRequired
};
