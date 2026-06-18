import React, {useCallback, useMemo, useState} from 'react';
import * as PropTypes from 'prop-types';
import {Button, Loader, Typography} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import {useLazyQuery, useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import styles from './GenerateScriptDialog.scss';

const STORE_MODULES_QUERY = gql`query {
    admin { modulesManagement { storeModules { symbolicName title icon latestVersion storeUrl } } }
}`;

const INSTALL_STORE_MODULES_MUTATION = gql`mutation ($symbolicNames: [String]!) {
    admin { modulesManagement { installStoreModules(symbolicNames: $symbolicNames) } }
}`;

export const InstallFromStoreDialog = ({isOpen, onClose, onInstallSuccess}) => {
    const {t} = useTranslation('module-management-community');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [status, setStatus] = useState('idle'); // idle | installing | success | error
    const [statusMessage, setStatusMessage] = useState('');

    const [loadModules, {data, loading, error}] = useLazyQuery(STORE_MODULES_QUERY, {
        fetchPolicy: 'network-only'
    });

    const [installModules] = useMutation(INSTALL_STORE_MODULES_MUTATION);

    const allModules = data?.admin?.modulesManagement?.storeModules || [];

    const filteredModules = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? allModules.filter(m =>
            m.symbolicName.toLowerCase().includes(q) ||
            (m.title && m.title.toLowerCase().includes(q))
        ) : allModules;
    }, [allModules, search]);

    const handleOpen = useCallback(() => {
        setSearch('');
        setSelected(new Set());
        setStatus('idle');
        setStatusMessage('');
        loadModules();
    }, [loadModules]);

    const toggleModule = useCallback(name => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(name)) {
                next.delete(name);
            } else {
                next.add(name);
            }

            return next;
        });
    }, []);

    const selectAll = useCallback(() => {
        setSelected(new Set(filteredModules.map(m => m.symbolicName)));
    }, [filteredModules]);

    const clearAll = useCallback(() => setSelected(new Set()), []);

    const handleInstall = async () => {
        const names = Array.from(selected).filter(n => filteredModules.some(m => m.symbolicName === n));
        if (names.length === 0) {
            return;
        }

        setStatus('installing');
        setStatusMessage('');
        try {
            const result = await installModules({variables: {symbolicNames: names}});
            const msg = result?.data?.admin?.modulesManagement?.installStoreModules;
            setStatus('success');
            setStatusMessage(msg || t('label.installFromStore.success', {count: names.length}));
        } catch (e) {
            setStatus('error');
            setStatusMessage(e.message || t('label.installFromStore.error'));
        }
    };

    const handleClose = () => {
        if (status === 'success') {
            onInstallSuccess?.();
        }

        setStatus('idle');
        setStatusMessage('');
        onClose();
    };

    const visibleSelected = filteredModules.filter(m => selected.has(m.symbolicName)).length;
    const isInstalling = status === 'installing';

    return (
        <Dialog
            fullWidth
            open={isOpen}
            maxWidth="md"
            data-testid="install-from-store-dialog"
            onClose={isInstalling ? undefined : handleClose}
            onEnter={handleOpen}
        >
            <DialogTitle disableTypography>
                <Typography variant="title">{t('label.installFromStore.title')}</Typography>
                <Typography variant="body" className={styles.subtitle}>
                    {t('label.installFromStore.subtitle')}
                </Typography>
            </DialogTitle>

            <DialogContent className={styles.content}>
                {/* Search + bulk actions */}
                <div className={styles.searchRow}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder={t('label.installFromStore.searchPlaceholder')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        disabled={isInstalling}
                    />
                    <Button variant="ghost"
                            size="small"
                            label={t('label.generateScript.selectAll')}
                            isDisabled={isInstalling || filteredModules.length === 0}
                            onClick={selectAll}/>
                    <Button variant="ghost"
                            size="small"
                            label={t('label.generateScript.clearAll')}
                            isDisabled={isInstalling || selected.size === 0}
                            onClick={clearAll}/>
                </div>

                {/* Module list */}
                <div className={styles.moduleList}>
                    {loading && (
                        <div style={{display: 'flex', alignItems: 'center', gap: 8, padding: 16}}>
                            <Loader size="small"/>
                            <Typography variant="body">{t('label.loading')}</Typography>
                        </div>
                    )}

                    {error && (
                        <Typography variant="body" className={styles.empty}>
                            {t('label.installFromStore.loadError')}
                        </Typography>
                    )}

                    {!loading && !error && filteredModules.length === 0 && (
                        <Typography variant="body" className={styles.empty}>
                            {search ? t('label.installFromStore.noResults') : t('label.installFromStore.noneAvailable')}
                        </Typography>
                    )}

                    {!loading && !error && filteredModules.map(m => {
                        const isChecked = selected.has(m.symbolicName);
                        return (
                            <label
                                key={m.symbolicName}
                                className={`${styles.moduleRow} ${isChecked ? styles.moduleRowChecked : ''}`}
                            >
                                <input
                                    type="checkbox"
                                    className={styles.checkbox}
                                    checked={isChecked}
                                    disabled={isInstalling}
                                    onChange={() => toggleModule(m.symbolicName)}
                                />
                                {m.icon ? (
                                    <img
                                        src={m.icon}
                                        alt=""
                                        className={styles.moduleIcon}
                                        onError={e => { e.target.style.display = 'none'; }}
                                    />
                                ) : (
                                    <span className={styles.moduleIconPlaceholder}>📦</span>
                                )}
                                <span className={styles.moduleTitleBlock}>
                                    <Typography variant="body" className={styles.moduleTitle}>
                                        {m.title || m.symbolicName}
                                    </Typography>
                                    <Typography variant="caption" className={styles.moduleSymbolicName}>
                                        {m.symbolicName}
                                    </Typography>
                                </span>
                                <span className={`${styles.badge} ${styles.badge_module}`}>
                                    {m.latestVersion}
                                </span>
                                {m.storeUrl && (
                                    <a
                                        href={m.storeUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.storeLink}
                                        onClick={e => e.stopPropagation()}
                                        title={t('label.installFromStore.viewOnStore')}
                                    >
                                        ↗
                                    </a>
                                )}
                            </label>
                        );
                    })}
                </div>

                {/* Status feedback */}
                {status === 'success' && (
                    <div className={styles.statusSuccess}>
                        <Typography variant="body">✅ {statusMessage}</Typography>
                    </div>
                )}

                {status === 'error' && (
                    <div className={styles.statusError}>
                        <Typography variant="body">⚠️ {statusMessage}</Typography>
                    </div>
                )}

                {/* Summary */}
                {!loading && !error && (
                    <Typography variant="caption" className={styles.summary}>
                        {t('label.installFromStore.summary', {
                            selected: visibleSelected,
                            total: filteredModules.length,
                            totalStore: allModules.length
                        })}
                    </Typography>
                )}
            </DialogContent>

            <DialogActions className={styles.actions}>
                <Button
                    variant="ghost"
                    size="big"
                    label={status === 'success' ? t('label.close') : t('label.cancel')}
                    isDisabled={isInstalling}
                    onClick={handleClose}
                />
                {status !== 'success' && (
                    <Button
                        variant="default"
                        size="big"
                        color="accent"
                        label={isInstalling ?
                            t('label.installFromStore.installing') :
                            t('label.installFromStore.install', {count: visibleSelected})}
                        isDisabled={visibleSelected === 0 || isInstalling}
                        onClick={handleInstall}
                    />
                )}
            </DialogActions>
        </Dialog>
    );
};

InstallFromStoreDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onInstallSuccess: PropTypes.func
};

export default InstallFromStoreDialog;

