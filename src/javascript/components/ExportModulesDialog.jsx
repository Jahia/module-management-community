import React, {useState} from 'react';
import {Button, Loader, Switch, Typography} from '@jahia/moonstone';
import {Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, FormGroup} from '@material-ui/core';
import {useTranslation} from 'react-i18next';
import styles from './ExportModulesDialog.scss';

const EXPORT_BASE_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/export`;

const BUNDLE_TYPES = ['module', 'system', 'templatesSet'];

export const ExportModulesDialog = ({isOpen, onClose}) => {
    const {t} = useTranslation('module-management-community');

    const [selectedTypes, setSelectedTypes] = useState(new Set(BUNDLE_TYPES));
    // embedAll=true (default): embed every JAR in the ZIP for a self-contained archive
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
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = `module-snapshot-${new Date().toISOString().split('T')[0]}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

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
        <Dialog open={isOpen} maxWidth="md" fullWidth onClose={handleClose} data-testid="export-modules-dialog">
            <DialogTitle disableTypography>
                <Typography variant="heading" weight="semiBold">
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
                                    onChange={() => handleTypeToggle(type)}
                                    disabled={isBusy || (selectedTypes.has(type) && selectedTypes.size === 1)}
                                    color="primary"
                                />
                            }
                            label={<Typography variant="body">{t(`label.export.dialog.types.${type}`)}</Typography>}
                        />
                    ))}
                </FormGroup>

                {/* Embed toggle */}
                <div className={styles.embedRow}>
                    <Switch
                        checked={embedAll}
                        onChange={(e, value, checked) => {
                            setEmbedAll(checked);
                            setPreviewYaml('');
                        }}
                        disabled={isBusy}
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

                {/* Status messages */}
                {isExporting && (
                    <div className={styles.statusRow}>
                        <Loader size="small"/>
                        <Typography variant="body">{t('label.export.dialog.exporting')}</Typography>
                    </div>
                )}

                {isPreviewing && (
                    <div className={styles.statusRow}>
                        <Loader size="small"/>
                        <Typography variant="body">{t('label.export.dialog.previewing')}</Typography>
                    </div>
                )}

                {status === 'error' && (
                    <div className={`${styles.statusRow} ${styles.statusError}`}>
                        <Typography variant="body">⚠️ {errorMessage}</Typography>
                    </div>
                )}

                {/* YAML preview */}
                {previewYaml && (
                    <div className={styles.previewContainer}>
                        <Typography variant="caption" weight="semiBold" className={styles.previewLabel}>
                            {t('label.export.dialog.preview.label')}
                        </Typography>
                        <pre className={styles.yamlPreview}>{previewYaml}</pre>
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

export default ExportModulesDialog;
