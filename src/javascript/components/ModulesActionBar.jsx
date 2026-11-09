import React, {useCallback, useRef, useState} from 'react';
import * as PropTypes from 'prop-types';
import {useTranslation} from 'react-i18next';
import {Button, Close, CloudDownload, Menu, MenuItem, MoreVert, Reload, Upload} from '@jahia/moonstone';
import {ActionMenuItem, CheckMenuItem} from './menu/MenuItems';
import {isNonDefault, UpdateOptionsPopover} from './UpdateOptionsPopover';
import styles from './ModuleManagementCommunityApp.scss';
import {useEscapeKey} from '../hooks/useEscapeKey';

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
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const closeMenu = useCallback(() => setIsMenuOpen(false), []);
    useEscapeKey(isMenuOpen, closeMenu);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const menuAnchorRef = useRef(null);

    // Each menu action closes the menu before it runs.
    const fromMenu = action => () => {
        setIsMenuOpen(false);
        action();
    };

    const updateMode = preferences.dryRun ? t('label.updateAllBadgeDry') : t('label.updateAllBadgeLive');

    return (
        <>
            <Button variant="ghost"
                    icon={<Reload/>}
                    label={t('label.refresh')}
                    title={lastUpdate ? t('label.lastUpdate', {date: lastUpdate}) : undefined}
                    isDisabled={isLoading}
                    data-testid="refresh-btn"
                    onClick={onRefresh}/>
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
            <span ref={menuAnchorRef} className={styles.menuAnchor}>
                <Button variant="ghost"
                        icon={<MoreVert/>}
                        aria-label={t('label.menu.more')}
                        title={t('label.menu.more')}
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        data-testid="more-actions-btn"
                        onClick={() => setIsMenuOpen(!isMenuOpen)}/>
            </span>
            {isMenuOpen && (
                <Menu isDisplayed
                      hasSearch={false}
                      anchorEl={menuAnchorRef}
                      minWidth="260px"
                      data-testid="more-actions-menu"
                      onClose={closeMenu}
                >
                    <MenuItem variant="title" label={t('label.menu.section.updates')}/>
                    <ActionMenuItem label={`${t('label.updateAll')} (${updateMode})`}
                                    title={preferences.dryRun ? t('label.updateAllDryRunTooltip') : t('label.updateAllLiveTooltip')}
                                    isDisabled={!hasUpdates}
                                    data-testid="update-all-btn"
                                    onClick={fromMenu(onUpdateAll)}/>
                    <ActionMenuItem label={isNonDefault(preferences) ? t('label.menu.updateOptionsModified') : t('label.menu.updateOptions')}
                                    data-testid="update-options-btn"
                                    onClick={fromMenu(() => setIsOptionsOpen(true))}/>
                    <CheckMenuItem label={t('label.autoRefresh.menu')}
                                   isChecked={preferences.autoRefresh}
                                   data-testid="auto-refresh-toggle"
                                   onToggle={() => onPreferencesChange({...preferences, autoRefresh: !preferences.autoRefresh})}/>
                    <MenuItem variant="title" label={t('label.menu.section.modules')}/>
                    <ActionMenuItem label={t('label.export.snapshot')}
                                    data-testid="export-snapshot-btn"
                                    onClick={fromMenu(onExport)}/>
                    <ActionMenuItem label={t('label.generateScript.menuItem')}
                                    data-testid="generate-script-btn"
                                    onClick={fromMenu(onGenerateScript)}/>
                    <ActionMenuItem label={t('label.cleanup.jcr')}
                                    title={t('label.cleanup.jcrDescription')}
                                    data-testid="cleanup-jcr-btn"
                                    onClick={fromMenu(onCleanupJcr)}/>
                    {isClustered && <MenuItem variant="title" label={t('label.cluster.ops.title')}/>}
                    {isClustered && CLUSTER_OPERATIONS.map(({key, labelKey}) => (
                        <ActionMenuItem key={key}
                                        label={t(labelKey)}
                                        data-testid={`cluster-${key}-btn`}
                                        onClick={fromMenu(() => onClusterOperation(key))}/>
                    ))}
                </Menu>
            )}
            <UpdateOptionsPopover preferences={preferences}
                                  isOpen={isOptionsOpen}
                                  onPreferencesChange={onPreferencesChange}
                                  onClose={() => setIsOptionsOpen(false)}/>
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
