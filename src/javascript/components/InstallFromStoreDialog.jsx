import React, {useCallback, useEffect, useMemo, useState} from 'react';
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

const STORE_MODULES_QUERY = gql`query {
    admin { modulesManagement { storeModules { symbolicName title icon latestVersion storeUrl } } }
}`;

const INSTALL_STORE_MODULES_MUTATION = gql`mutation ($symbolicNames: [String]!) {
    admin { modulesManagement { installStoreModules(symbolicNames: $symbolicNames) } }
}`;

const TITLE_ID = 'install-from-store-dialog-title';

// Single store-module row — extracted to keep the dialog's cognitive complexity low.
const StoreModuleRow = ({module, isChecked, isDisabled, onToggle, viewLabel}) => (
    <label
        className={`${styles.moduleRow} ${isChecked ? styles.moduleRowChecked : ''}`}
    >
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
        {/* A11y A-012 / MED target-size: descriptive aria-label on store link */}
        {module.storeUrl && (
            <a
                href={module.storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.storeLink}
                aria-label={viewLabel}
                onClick={e => e.stopPropagation()}
            >
                <OpenInNew aria-hidden="true"/>
            </a>
        )}
    </label>
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

export const InstallFromStoreDialog = ({isOpen, onClose, onInstallSuccess}) => {
    const {t} = useTranslation('module-management-community');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [status, setStatus] = useState('idle'); // Idle | installing | success | error
    const [statusMessage, setStatusMessage] = useState('');

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

    const handleOpen = useCallback(() => {
        setSearch('');
        setSelected(new Set());
        setStatus('idle');
        setStatusMessage('');
        loadModules();
    }, [loadModules]);

    // The catalogue reloads, and the selection resets, each time the modal opens
    useEffect(() => {
        if (isOpen) {
            handleOpen();
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

    // Escape and a click outside the modal close it, except while the installation runs
    const handleOpenChange = open => {
        if (!open && !isInstalling) {
            handleClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            size="full"
            className={styles.modal}
            data-testid="install-from-store-dialog"
            aria-labelledby={TITLE_ID}
            onOpenChange={handleOpenChange}
        >
            <>
                <ModalHeader id={TITLE_ID} title={t('label.installFromStore.title')}>
                    {t('label.installFromStore.subtitle')}
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
                        <Button variant="ghost"
                                size="small"
                                label={t('label.generateScript.clearAll')}
                                isDisabled={isInstalling || selected.size === 0}
                                onClick={clearAll}/>
                    </div>

                    {/* Module list */}
                    <div className={styles.moduleList}>
                        {/* A11y C-005: loader with role="status" */}
                        {loading && (
                            <div className={styles.loading} role="status" aria-live="polite">
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

                        {!loading && !error && filteredModules.map(m => (
                            <StoreModuleRow
                                key={m.symbolicName}
                                module={m}
                                isChecked={selected.has(m.symbolicName)}
                                isDisabled={isInstalling}
                                viewLabel={t('label.installFromStore.viewOnStoreAriaLabel', {name: m.title || m.symbolicName, defaultValue: `View ${m.title || m.symbolicName} on store (opens in new window)`})}
                                onToggle={toggleModule}
                            />
                        ))}
                    </div>

                    {/* A11y A-009: status feedback as live regions; A-013: emoji aria roles */}
                    {status === 'success' && (
                        <div className={styles.statusSuccess} role="status" aria-live="polite">
                            <Typography variant="body">
                                <span role="img" aria-label="Success">✅</span> {statusMessage}
                            </Typography>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className={styles.statusError} role="alert" aria-live="assertive">
                            <Typography variant="body">
                                <span role="img" aria-label="Warning">⚠️</span> {statusMessage}
                            </Typography>
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
                </ModalBody>

                {/* The footer lays its children out right to left: the primary action comes first */}
                <ModalFooter>
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

