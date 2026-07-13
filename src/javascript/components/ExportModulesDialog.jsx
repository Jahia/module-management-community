import React, {useState} from 'react';
import {Button, Loader, Switch, Typography} from '@jahia/moonstone';
import {useNotifications} from '@jahia/react-material';
import {Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup} from '@material-ui/core';
import {useTranslation} from 'react-i18next';
import styles from './ExportModulesDialog.scss';
import PropTypes from 'prop-types';

const EXPORT_BASE_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/export`;

const BUNDLE_TYPES = ['module', 'system', 'templatesSet'];

export const ExportModulesDialog = ({isOpen, onClose}) => {
    const {t} = useTranslation('module-management-community');
    const notificationContext = useNotifications(); // A11y B-027

    const [selectedTypes, setSelectedTypes] = useState(new Set(BUNDLE_TYPES));
    // EmbedAll=true (default): embed every JAR in the ZIP for a self-contained archive
    const [embedAll, setEmbedAll] = useState(true);
    const [status, setStatus] = useState('idle');
    const [errorMessage, setErrorMessage] = useState('');
    const [previewYaml, setPreviewYaml] = useState('');

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
        onClose();
    };

    const buildUrl = () => {
        const params = new URLSearchParams();
        params.set('types', Array.from(selectedTypes).join(','));
        params.set('embedAll', String(embedAll));
        return `${EXPORT_BASE_URL}?${params.toString()}`;
    };

    const handlePreview = async () => {
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
                throw new Error(json?.errors?.[0]?.message || 'No preview data returned');
            }
        } catch (err) {
            setStatus('error');
            setErrorMessage(err.message || t('label.export.dialog.error.generic'));
        }
    };

    const handleExport = async () => {
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
                t('label.export.dialog.downloadStarted', {fileName, defaultValue: `Download started: ${fileName}`}),
                ['closeButton', 'closeAfter5s']
            );

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

    return (
        <Dialog fullWidth open={isOpen} maxWidth="md" data-testid="export-modules-dialog" PaperProps={{'aria-modal': 'true'}} onClose={handleClose}>
            <DialogTitle disableTypography>
                <Typography variant="heading" weight="semiBold" component="h2">
                    {t('label.export.dialog.title')}
                </Typography>
            </DialogTitle>

            <DialogContent className={styles.dialogContent}>
                {/* Type selector */}
                <Typography variant="body" weight="semiBold" className={styles.sectionLabel}>
                    {t('label.export.dialog.types.label')}
                </Typography>
                <FormGroup row className={styles.typeGroup}>
                    {BUNDLE_TYPES.map(type => (
                        <FormControlLabel
                            key={type}
                            className={styles.typeControl}
                            control={
                                <Checkbox
                                    checked={selectedTypes.has(type)}
                                    disabled={isBusy || (selectedTypes.has(type) && selectedTypes.size === 1)}
                                    color="primary"
                                    onChange={() => handleTypeToggle(type)}
                                />
                            }
                            label={<Typography variant="body">{t(`label.export.dialog.types.${type}`)}</Typography>}
                        />
                    ))}
                </FormGroup>

                {/* A11y B-012: embed toggle with programmatic label */}
                <div className={styles.embedRow}>
                    <Switch
                        data-testid="embed-all-toggle"
                        checked={embedAll}
                        disabled={isBusy}
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
                        <Typography variant="caption" className={styles.embedHint}>
                            {embedAll ?
                                t('label.export.dialog.embedAll.on') :
                                t('label.export.dialog.embedAll.off')}
                        </Typography>
                    </div>
                </div>

                <Typography variant="caption" className={styles.hint}>
                    {t('label.export.dialog.hint')}
                </Typography>

                {/* A11y C-004: loading spinners with role="status" */}
                {isExporting && (
                    <div className={styles.statusRow} role="status" aria-live="polite">
                        <Loader size="small"/>
                        <Typography variant="body">{t('label.export.dialog.exporting')}</Typography>
                    </div>
                )}

                {isPreviewing && (
                    <div className={styles.statusRow} role="status" aria-live="polite">
                        <Loader size="small"/>
                        <Typography variant="body">{t('label.export.dialog.previewing')}</Typography>
                    </div>
                )}

                {/* A11y B-022: error as live alert region with emoji aria role */}
                {status === 'error' && (
                    <div className={`${styles.statusRow} ${styles.statusError}`}
                         role="alert"
                         aria-live="assertive"
                    >
                        <Typography variant="body">
                            <span role="img" aria-label="Warning">⚠️</span> {errorMessage}
                        </Typography>
                    </div>
                )}

                {/* YAML preview — A11y C-014: keyboard-scrollable pre block */}
                {previewYaml && (
                    <div className={styles.previewContainer}>
                        <Typography variant="caption" weight="semiBold" className={styles.previewLabel}>
                            {t('label.export.dialog.preview.label')}
                        </Typography>
                        <pre className={styles.yamlPreview}
                             tabIndex={0}
                             aria-label={t('label.export.dialog.preview.ariaLabel', 'YAML provisioning preview')}
                        >
                            {previewYaml}
                        </pre>
                    </div>
                )}
            </DialogContent>

            <DialogActions className={styles.dialogActions}>
                <Button
                    variant="ghost"
                    size="big"
                    label={t('label.export.dialog.preview.button')}
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
                    isDisabled={isBusy || selectedTypes.size === 0}
                    onClick={handleExport}
                />
            </DialogActions>
        </Dialog>
    );
};

ExportModulesDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

export default ExportModulesDialog;
