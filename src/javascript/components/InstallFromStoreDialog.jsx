import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import * as PropTypes from 'prop-types';
import {
    Badge,
    Button,
    Checkbox,
    Loader,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    OpenInNew,
    SearchInput,
    Typography
} from '@jahia/moonstone';
import {useLazyQuery, useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import styles from './InstallFromStoreDialog.scss';
import {focusFooterAction, focusLater} from './dialogFocus';
import {useCountAnnouncement} from '../hooks/useCountAnnouncement';

const STORE_MODULES_QUERY = gql`query {
    admin { modulesManagement { storeModules { symbolicName title icon latestVersion storeUrl } } }
}`;

const INSTALL_STORE_MODULES_MUTATION = gql`mutation ($symbolicNames: [String]!) {
    admin { modulesManagement { installStoreModules(symbolicNames: $symbolicNames) } }
}`;

const SUBTITLE_ID = 'install-from-store-dialog-subtitle';

// Single store-module row — extracted to keep the dialog's cognitive complexity low.
// The store link sits beside the label, so its text does not join the checkbox name.
const StoreModuleRow = ({module, isChecked, isDisabled, onToggle, viewLabel}) => (
    <div className={`${styles.moduleRow} ${isChecked ? styles.moduleRowChecked : ''}`}>
        <label className={styles.moduleLabel}>
            <Checkbox
                value={module.symbolicName}
                checked={isChecked}
                isDisabled={isDisabled}
                onChange={() => onToggle(module.symbolicName)}
            />
            {/* A11y A-013: decorative emoji hidden from AT */}
            {module.icon ? (
                <img
                    src={module.icon}
                    alt=""
                    className={styles.moduleIcon}
                    onError={e => {
                        e.target.style.display = 'none';
                    }}
                />
            ) : (
                <span role="img" aria-hidden="true" className={styles.moduleIconPlaceholder}>📦</span>
            )}
            <span className={styles.moduleTitleBlock}>
                <Typography variant="body" weight="semiBold" className={styles.moduleTitle}>
                    {module.title || module.symbolicName}
                </Typography>
                <Typography variant="caption" className={styles.moduleSymbolicName}>
                    {module.symbolicName}
                </Typography>
            </span>
            <Badge label={module.latestVersion} color="accent"/>
        </label>
        {/* A11y A-012 / MED target-size: descriptive aria-label on store link */}
        {module.storeUrl && (
            <a
                href={module.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.storeLink}
                aria-label={viewLabel}
            >
                <OpenInNew aria-hidden="true"/>
            </a>
        )}
    </div>
);

StoreModuleRow.propTypes = {
    module: PropTypes.shape({
        symbolicName: PropTypes.string,
        title: PropTypes.string,
        icon: PropTypes.string,
        latestVersion: PropTypes.string,
        storeUrl: PropTypes.string
    }).isRequired,
    isChecked: PropTypes.bool.isRequired,
    isDisabled: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired,
    viewLabel: PropTypes.string.isRequired
};

// The catalogue: loading, load error, empty result or the rows
const StoreModuleList = ({modules, isLoading, hasError, search, selected, isInstalling, onToggle}) => {
    const {t} = useTranslation('module-management-community');
    const isReady = !isLoading && !hasError;
    return (
        <div className={styles.moduleList}>
            {isLoading && (
                <div className={styles.loading}>
                    <Loader size="small"/>
                    <Typography variant="body">{t('label.loading')}</Typography>
                </div>
            )}

            {hasError && (
                <div role="alert" className={styles.empty}>
                    {t('label.installFromStore.loadError')}
                </div>
            )}

            {isReady && modules.length === 0 && (
                <Typography variant="body" className={styles.empty}>
                    {search ? t('label.installFromStore.noResults') : t('label.installFromStore.noneAvailable')}
                </Typography>
            )}

            {isReady && modules.map(m => (
                <StoreModuleRow
                    key={m.symbolicName}
                    module={m}
                    isChecked={selected.has(m.symbolicName)}
                    isDisabled={isInstalling}
                    viewLabel={t('label.installFromStore.viewOnStoreAriaLabel', {name: m.title || m.symbolicName})}
                    onToggle={onToggle}
                />
            ))}
        </div>
    );
};

StoreModuleList.propTypes = {
    modules: PropTypes.arrayOf(PropTypes.object).isRequired,
    isLoading: PropTypes.bool,
    hasError: PropTypes.bool.isRequired,
    search: PropTypes.string.isRequired,
    selected: PropTypes.instanceOf(Set).isRequired,
    isInstalling: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired
};

// Text and look of the polite status region: progress, result, catalogue loading or result count
const getStatusView = ({isInstalling, isSuccess, loading, countMessage, statusMessage, t}) => {
    if (isInstalling) {
        return {politeMessage: t('label.installFromStore.installing'), statusClassName: styles.statusProgress};
    }

    if (isSuccess) {
        return {politeMessage: statusMessage, statusClassName: styles.statusSuccess};
    }

    return {politeMessage: loading ? t('label.loading') : countMessage, statusClassName: styles.srOnly};
};

export const InstallFromStoreDialog = ({isOpen, onClose, onInstallSuccess}) => {
    const {t} = useTranslation('module-management-community');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [status, setStatus] = useState('idle'); // Idle | installing | success | error
    const [statusMessage, setStatusMessage] = useState('');
    const footerRef = useRef(null);
    const statusRef = useRef(null);
    // Set when the user starts an installation, so focus follows the result of that action only
    const followInstallFocus = useRef(false);

    const [loadModules, {data, loading, error}] = useLazyQuery(STORE_MODULES_QUERY, {
        fetchPolicy: 'network-only'
    });

    const [installModules] = useMutation(INSTALL_STORE_MODULES_MUTATION);

    // A11y / react-hooks: memoise so the reference is stable across renders
    const allModules = useMemo(
        () => data?.admin?.modulesManagement?.storeModules || [],
        [data]
    );

    const filteredModules = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? allModules.filter(m =>
            m.symbolicName.toLowerCase().includes(q) ||
            (m.title && m.title.toLowerCase().includes(q))
        ) : allModules;
    }, [allModules, search]);

    const [countMessage, setCountMessage] = useCountAnnouncement(
        filteredModules.length,
        isOpen,
        count => t('label.dialogs.shownCount', {count})
    );

    const handleOpen = useCallback(() => {
        setSearch('');
        setSelected(new Set());
        setStatus('idle');
        setStatusMessage('');
        followInstallFocus.current = false;
        loadModules();
    }, [loadModules]);

    // The catalogue reloads, and the selection resets, each time the modal opens
    useEffect(() => {
        if (isOpen) {
            handleOpen();
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    // The pressed Install button is disabled, then removed: move focus with the result
    useEffect(() => {
        if (!followInstallFocus.current) {
            return;
        }

        if (status === 'installing') {
            focusLater(() => statusRef.current);
        } else if (status === 'success') {
            followInstallFocus.current = false;
            focusFooterAction(footerRef, 'close');
        } else if (status === 'error') {
            followInstallFocus.current = false;
            focusFooterAction(footerRef, 'install');
        }
    }, [status]);

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
        setCountMessage(t('label.dialogs.selectedCount', {
            selected: filteredModules.length,
            total: filteredModules.length
        }));
    }, [filteredModules, setCountMessage, t]);

    const clearAll = useCallback(() => {
        setSelected(new Set());
        setCountMessage(t('label.dialogs.selectedCount', {selected: 0, total: filteredModules.length}));
    }, [filteredModules, setCountMessage, t]);

    const handleInstall = async () => {
        const names = Array.from(selected).filter(n => filteredModules.some(m => m.symbolicName === n));
        if (names.length === 0) {
            return;
        }

        followInstallFocus.current = true;
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
        followInstallFocus.current = false;
        onClose();
    };

    const visibleSelected = filteredModules.filter(m => selected.has(m.symbolicName)).length;
    const isInstalling = status === 'installing';
    const isSuccess = status === 'success';

    // Escape and a click outside the modal close it, except while the installation runs
    const handleOpenChange = open => {
        if (!open && !isInstalling) {
            handleClose();
        }
    };

    const {politeMessage, statusClassName} = getStatusView({isInstalling, isSuccess, loading, countMessage, statusMessage, t});

    return (
        <Modal
            isOpen={isOpen}
            size="full"
            className={styles.modal}
            data-testid="install-from-store-dialog"
            aria-labelledby={undefined}
            aria-label={t('label.installFromStore.title')}
            aria-describedby={SUBTITLE_ID}
            onOpenChange={handleOpenChange}
        >
            <>
                {/* The header wraps the title and the subtitle: the dialog takes the title as name, the subtitle as description */}
                <ModalHeader title={t('label.installFromStore.title')}>
                    <span id={SUBTITLE_ID}>{t('label.installFromStore.subtitle')}</span>
                </ModalHeader>

                <ModalBody className={styles.content}>
                    {/* Search + bulk actions */}
                    <div className={styles.searchRow}>
                        {/* A11y A-016: programmatic label for search input */}
                        <SearchInput
                            id="store-search"
                            className={styles.searchInput}
                            aria-label={t('label.installFromStore.searchPlaceholder')}
                            placeholder={t('label.installFromStore.searchPlaceholder')}
                            value={search}
                            isDisabled={isInstalling}
                            onChange={e => setSearch(e.target.value)}
                            onClear={() => setSearch('')}
                        />
                        <Button variant="ghost"
                                size="small"
                                label={t('label.generateScript.selectAll')}
                                isDisabled={isInstalling || filteredModules.length === 0}
                                onClick={selectAll}/>
                        {/* Not disabled when nothing is selected: pressing it must not drop the focus */}
                        <Button variant="ghost"
                                size="small"
                                label={t('label.generateScript.clearAll')}
                                isDisabled={isInstalling}
                                onClick={clearAll}/>
                    </div>

                    <StoreModuleList
                        modules={filteredModules}
                        isLoading={loading}
                        hasError={Boolean(error)}
                        search={search}
                        selected={selected}
                        isInstalling={isInstalling}
                        onToggle={toggleModule}
                    />

                    {/* Both regions stay mounted, so a screen reader hears every change of their text */}
                    <div ref={statusRef} role="status" tabIndex={-1} className={statusClassName}>
                        {isInstalling && <Loader size="small"/>}
                        {politeMessage && (
                            <Typography variant="body" component="span">
                                {isSuccess && (
                                    <span role="img" aria-label={t('label.dialogs.status.success')}>✅</span>
                                )}
                                {isSuccess && ' '}
                                {politeMessage}
                            </Typography>
                        )}
                    </div>

                    <div role="alert" className={status === 'error' ? styles.statusError : styles.srOnly}>
                        {status === 'error' && (
                            <Typography variant="body" component="span">
                                <span role="img" aria-label={t('label.dialogs.status.error')}>⚠️</span> {statusMessage}
                            </Typography>
                        )}
                    </div>

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
                </ModalBody>

                {/* The footer lays its children out right to left: the primary action comes first */}
                <ModalFooter ref={footerRef}>
                    <Button
                        variant="ghost"
                        size="big"
                        label={isSuccess ? t('label.close') : t('label.cancel')}
                        isDisabled={isInstalling}
                        data-focus="close"
                        onClick={handleClose}
                    />
                    {!isSuccess && (
                        <Button
                            variant="default"
                            size="big"
                            color="accent"
                            label={isInstalling ?
                                t('label.installFromStore.installing') :
                                t('label.installFromStore.install', {count: visibleSelected})}
                            isDisabled={visibleSelected === 0 || isInstalling}
                            data-focus="install"
                            onClick={handleInstall}
                        />
                    )}
                </ModalFooter>
            </>
        </Modal>
    );
};

InstallFromStoreDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onInstallSuccess: PropTypes.func
};

export default InstallFromStoreDialog;
