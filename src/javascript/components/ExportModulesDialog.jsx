import React, {useEffect, useRef, useState} from 'react';
import {
    Button,
    CheckboxItem,
    Loader,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Switch,
    Typography
} from '@jahia/moonstone';
import {useNotifications} from '@jahia/react-material';
import {useTranslation} from 'react-i18next';
import styles from './ExportModulesDialog.scss';
import PropTypes from 'prop-types';
import {focusFooterAction, focusLater} from './dialogFocus';

const EXPORT_BASE_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/export`;

const BUNDLE_TYPES = ['module', 'system', 'templatesSet'];

const TITLE_ID = 'export-modules-dialog-title';
const TYPES_LABEL_ID = 'export-modules-types-label';

export const ExportModulesDialog = ({isOpen, onClose}) => {
    const {t} = useTranslation('module-management-community');
    const notificationContext = useNotifications(); // A11y B-027

    const [selectedTypes, setSelectedTypes] = useState(new Set(BUNDLE_TYPES));
    // EmbedAll=true (default): embed every JAR in the ZIP for a self-contained archive
    const [embedAll, setEmbedAll] = useState(true);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [previewYaml, setPreviewYaml] = useState('');
    const footerRef = useRef(null);
    const statusRef = useRef(null);
    const previewRef = useRef(null);
    // The footer action the user pressed last ('preview' | 'export'), so focus follows its result
    const pendingAction = useRef(null);

    // The pressed action is disabled while it runs: focus waits on the progress message,
    // then goes to the preview, or back to the action after a failure
    useEffect(() => {
        if (!pendingAction.current) {
            return;
        }

        if (status === 'previewing' || status === 'exporting') {
            focusLater(() => statusRef.current);
        } else if (status === 'error') {
            focusFooterAction(footerRef, pendingAction.current);
            pendingAction.current = null;
        } else if (status === 'idle' && previewYaml) {
            focusLater(() => previewRef.current);
            pendingAction.current = null;
        }
    }, [status, previewYaml]);

    const handleTypeToggle = type => {
        setSelectedTypes(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                if (next.size > 1) {
                    next.delete(type);
                }
            } else {
                next.add(type);
            }

            return next;
        });
        setPreviewYaml('');
    };

    const handleClose = () => {
        if (status === 'exporting') {
            return;
        }

        setStatus('idle');
        setErrorMessage('');
        setPreviewYaml('');
        pendingAction.current = null;
        onClose();
    };

    const buildUrl = () => {
        const params = new URLSearchParams();
        params.set('types', Array.from(selectedTypes).join(','));
        params.set('embedAll', String(embedAll));
        return `${EXPORT_BASE_URL}?${params.toString()}`;
    };

    const handlePreview = async () => {
        pendingAction.current = 'preview';
        setStatus('previewing');
        setErrorMessage('');
        setPreviewYaml('');
        try {
            const typesArg = Array.from(selectedTypes).map(tp => `"${tp}"`).join(', ');
            const body = JSON.stringify({
                query: `query { admin { modulesManagement { exportYamlPreview(types: [${typesArg}], embedAll: ${embedAll}) } } }`
            });
            const resp = await fetch(`${window.contextJsParameters?.contextPath || ''}/modules/graphql`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body
            });
            const json = await resp.json();
            const yaml = json?.data?.admin?.modulesManagement?.exportYamlPreview;
            if (yaml) {
                setPreviewYaml(yaml);
                setStatus('idle');
            } else {
                throw new Error(json?.errors?.[0]?.message || t('label.export.dialog.error.noPreview'));
            }
        } catch (err) {
            setStatus('error');
            setErrorMessage(err.message || t('label.export.dialog.error.generic'));
        }
    };

    const handleExport = async () => {
        pendingAction.current = 'export';
        setStatus('exporting');
        setErrorMessage('');
        const url = buildUrl();
        try {
            const response = await fetch(url, {
                credentials: 'same-origin',
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(text || `HTTP ${response.status}`);
            }

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            const fileName = `module-snapshot-${new Date().toISOString().split('T')[0]}.zip`;
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

            // A11y B-027: notify screen readers the download has started
            notificationContext.notify(
                t('label.export.dialog.downloadStarted', {fileName, interpolation: {escapeValue: false}}),
                ['closeButton', 'closeAfter5s']
            );

            pendingAction.current = null;
            setStatus('idle');
            handleClose();
        } catch (err) {
            setStatus('error');
            setErrorMessage(err.message || t('label.export.dialog.error.generic'));
        }
    };

    const isExporting = status === 'exporting';
    const isPreviewing = status === 'previewing';
    const isBusy = isExporting || isPreviewing;

    let politeMessage = '';
    if (isExporting) {
        politeMessage = t('label.export.dialog.exporting');
    } else if (isPreviewing) {
        politeMessage = t('label.export.dialog.previewing');
    } else if (previewYaml) {
        politeMessage = t('label.export.dialog.preview.ready');
    }

    return (
        <Modal
            isOpen={isOpen}
            size="full"
            className={styles.modal}
            data-testid="export-modules-dialog"
            aria-labelledby={TITLE_ID}
            onOpenChange={open => !open && handleClose()}
        >
            <>
                <ModalHeader id={TITLE_ID} title={t('label.export.dialog.title')}/>

                <ModalBody className={styles.dialogContent}>
                    {/* Type selector */}
                    <Typography id={TYPES_LABEL_ID} variant="body" weight="semiBold">
                        {t('label.export.dialog.types.label')}
                    </Typography>
                    {/* A CheckboxGroup would disable every item at once: the last checked type is disabled alone */}
                    <div role="group" aria-labelledby={TYPES_LABEL_ID}>
                        {BUNDLE_TYPES.map(type => (
                            <CheckboxItem
                                key={type}
                                id={`export-type-${type}`}
                                name="export-types"
                                value={type}
                                label={t(`label.export.dialog.types.${type}`)}
                                checked={selectedTypes.has(type)}
                                isDisabled={isBusy || (selectedTypes.has(type) && selectedTypes.size === 1)}
                                onChange={() => handleTypeToggle(type)}
                            />
                        ))}
                    </div>

                    {/* A11y B-012: embed toggle with programmatic label */}
                    <div className={styles.embedRow}>
                        <Switch
                            data-testid="embed-all-toggle"
                            checked={embedAll}
                            isDisabled={isBusy}
                            aria-label={t('label.export.dialog.embedAll.label')}
                            onChange={(e, value, checked) => {
                                setEmbedAll(checked);
                                setPreviewYaml('');
                            }}
                        />
                        <div className={styles.embedLabel}>
                            <Typography variant="body" weight="semiBold">
                                {t('label.export.dialog.embedAll.label')}
                            </Typography>
                            <Typography variant="caption" className={styles.hint}>
                                {embedAll ?
                                    t('label.export.dialog.embedAll.on') :
                                    t('label.export.dialog.embedAll.off')}
                            </Typography>
                        </div>
                    </div>

                    <Typography variant="caption" className={styles.hint}>
                        {t('label.export.dialog.hint')}
                    </Typography>

                    {/* Both regions stay mounted, so a screen reader hears every change of their text */}
                    <div ref={statusRef}
                         role="status"
                         tabIndex={-1}
                         className={isBusy ? styles.statusRow : styles.srOnly}
                    >
                        {isBusy && <Loader size="small"/>}
                        {politeMessage && <Typography variant="body" component="span">{politeMessage}</Typography>}
                    </div>

                    <div role="alert" className={status === 'error' ? `${styles.statusRow} ${styles.statusError}` : styles.srOnly}>
                        {status === 'error' && (
                            <Typography variant="body" component="span">
                                <span role="img" aria-label={t('label.dialogs.status.error')}>⚠️</span> {errorMessage}
                            </Typography>
                        )}
                    </div>

                    {/* YAML preview — A11y C-014: keyboard-scrollable pre block */}
                    {previewYaml && (
                        <div className={styles.previewContainer}>
                            <Typography variant="caption" weight="semiBold" className={styles.previewLabel}>
                                {t('label.export.dialog.preview.label')}
                            </Typography>
                            <pre ref={previewRef}
                                 className={styles.yamlPreview}
                                 role="region"
                                 tabIndex={0}
                                 aria-label={t('label.export.dialog.preview.ariaLabel')}
                            >
                                {previewYaml}
                            </pre>
                        </div>
                    )}
                </ModalBody>

                {/* The footer lays its children out right to left: the primary action comes first */}
                <ModalFooter ref={footerRef}>
                    <Button
                        variant="ghost"
                        size="big"
                        label={t('label.export.dialog.preview.button')}
                        data-focus="preview"
                        isDisabled={isBusy || selectedTypes.size === 0}
                        onClick={handlePreview}
                    />
                    <Button
                        variant="ghost"
                        size="big"
                        label={t('label.cancel')}
                        isDisabled={isExporting}
                        onClick={handleClose}
                    />
                    <Button
                        variant="default"
                        size="big"
                        label={t('label.export.dialog.export')}
                        data-focus="export"
                        isDisabled={isBusy || selectedTypes.size === 0}
                        onClick={handleExport}
                    />
                </ModalFooter>
            </>
        </Modal>
    );
};

ExportModulesDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

export default ExportModulesDialog;
