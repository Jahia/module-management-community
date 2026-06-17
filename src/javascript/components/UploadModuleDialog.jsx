import React, {useCallback, useRef, useState} from 'react';
import {Button, Loader, Typography} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Radio, RadioGroup} from '@material-ui/core';
import {useTranslation} from 'react-i18next';
import styles from './UploadModuleDialog.scss';
import PropTypes from 'prop-types';

const UPLOAD_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/upload`;
const IMPORT_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/import`;

/**
 * Dialog for deploying a single module JAR **or** importing a module snapshot ZIP archive.
 *
 * @param {boolean}  isOpen          Whether the dialog is visible.
 * @param {Function} onClose         Called when the dialog is dismissed.
 * @param {Function} onDeploySuccess Called after a successful deployment; parent should refetch modules.
 */
export const UploadModuleDialog = ({isOpen, onClose, onDeploySuccess}) => {
    const {t} = useTranslation('module-management-community');
    const fileInputRef = useRef(null);

    // 'jar' = deploy single module | 'zip' = import snapshot archive
    const [mode, setMode] = useState('jar');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    // 'idle' | 'uploading' | 'success' | 'error'
    const [status, setStatus] = useState('idle');
    const [statusMessage, setStatusMessage] = useState('');

    const isZipMode = mode === 'zip';

    const resetState = () => {
        setSelectedFile(null);
        setStatus('idle');
        setStatusMessage('');
        setIsDragging(false);
    };

    const handleModeChange = newMode => {
        setMode(newMode);
        resetState();
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const validateFile = file => {
        if (!file) {
            return t('label.upload.validation.noFile');
        }

        const name = file.name.toLowerCase();
        if (isZipMode) {
            if (!name.endsWith('.zip')) {
                return t('label.import.validation.notZip');
            }
        } else if (!name.endsWith('.jar')) {
            return t('label.upload.validation.notJar');
        }

        return null; // Valid
    };

    const selectFile = file => {
        const error = validateFile(file);
        if (error) {
            setStatus('error');
            setStatusMessage(error);
            setSelectedFile(null);
        } else {
            setSelectedFile(file);
            setStatus('idle');
            setStatusMessage('');
        }
    };

    const handleFileInputChange = e => {
        selectFile(e.target.files[0] || null);
        e.target.value = '';
    };

    const handleDragOver = useCallback(e => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback(e => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback(e => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files[0] || null;
        selectFile(file);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleUpload = async () => {
        if (!selectedFile) {
            return;
        }

        setStatus('uploading');
        setStatusMessage('');

        const formData = new FormData();
        const fieldName = isZipMode ? 'archive' : 'file';
        formData.append(fieldName, selectedFile, selectedFile.name);

        const url = isZipMode ? IMPORT_URL : UPLOAD_URL;

        try {
            const resp = await fetch(url, {
                method: 'POST',
                body: formData,
                credentials: 'same-origin',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });

            const json = await resp.json().catch(() => ({}));

            if (!resp.ok) {
                throw new Error(json.error || `HTTP ${resp.status}`);
            }

            setStatus('success');
            setStatusMessage(json.message || t('label.upload.success', {fileName: selectedFile.name}));
        } catch (err) {
            setStatus('error');
            setStatusMessage(err.message || t('label.upload.error.generic'));
        }
    };

    const handleSuccessClose = () => {
        resetState();
        onDeploySuccess();
    };

    const isUploading = status === 'uploading';
    const isSuccess = status === 'success';

    const dropzoneLabel = isZipMode ?
        t('label.import.dialog.dropzone') :
        t('label.upload.dialog.dropzone');

    const deployLabel = isZipMode ?
        t('label.import.dialog.import') :
        t('label.upload.dialog.deploy');

    const uploadingLabel = isZipMode ?
        t('label.import.dialog.importing') :
        t('label.upload.dialog.deploying');

    const hintLabel = isZipMode ?
        t('label.import.dialog.hint') :
        t('label.upload.dialog.hint');

    const fileIcon = isZipMode ? '🗜️' : '📦';

    return (
        <Dialog
            fullWidth
            open={isOpen}
            maxWidth="sm"
            data-testid="upload-module-dialog"
            onClose={isUploading ? undefined : handleClose}
        >
            <DialogTitle disableTypography>
                <Typography variant="heading" weight="semiBold">
                    {t('label.upload.dialog.title')}
                </Typography>
            </DialogTitle>

            <DialogContent className={styles.dialogContent}>
                {/* Mode selector */}
                <RadioGroup
                    value={mode}
                    className={styles.modeGroup}
                    onChange={e => handleModeChange(e.target.value)}
                >
                    <FormControlLabel
                        className={styles.typeControl}
                        value="jar"
                        control={<Radio color="primary" disabled={isUploading}/>}
                        label={<Typography variant="body">{t('label.upload.mode.jar')}</Typography>}
                    />
                    <FormControlLabel
                        className={styles.typeControl}
                        value="zip"
                        control={<Radio color="primary" disabled={isUploading}/>}
                        label={<Typography variant="body">{t('label.upload.mode.zip')}</Typography>}
                    />
                </RadioGroup>

                {/* Drop zone */}
                {!isSuccess && (
                    <div
                        className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''} ${selectedFile ? styles.dropZoneSelected : ''}`}
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={isZipMode ? '.zip' : '.jar'}
                            className={styles.hiddenInput}
                            onChange={handleFileInputChange}
                        />
                        {selectedFile ? (
                            <>
                                <Typography variant="body" weight="semiBold" className={styles.fileName}>
                                    {fileIcon} {selectedFile.name}
                                </Typography>
                                <Typography variant="caption" className={styles.fileSize}>
                                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                </Typography>
                            </>
                        ) : (
                            <Typography variant="body" className={styles.dropZoneHint}>
                                {dropzoneLabel}
                            </Typography>
                        )}
                    </div>
                )}

                {/* Status feedback */}
                {isUploading && (
                    <div className={styles.statusRow}>
                        <Loader size="small"/>
                        <Typography variant="body">{uploadingLabel}</Typography>
                    </div>
                )}

                {status === 'success' && (
                    <div className={`${styles.statusRow} ${styles.statusSuccess}`}>
                        <Typography variant="body">✅ {statusMessage}</Typography>
                    </div>
                )}

                {status === 'error' && (
                    <div className={`${styles.statusRow} ${styles.statusError}`}>
                        <Typography variant="body">⚠️ {statusMessage}</Typography>
                    </div>
                )}

                {/* Helper text */}
                {!isSuccess && (
                    <Typography variant="caption" className={styles.helperText}>
                        {hintLabel}
                    </Typography>
                )}
            </DialogContent>

            <DialogActions className={styles.dialogActions}>
                {isSuccess ? (
                    <Button
                        variant="default"
                        size="big"
                        label={t('label.close')}
                        onClick={handleSuccessClose}
                    />
                ) : (
                    <>
                        <Button
                            variant="ghost"
                            size="big"
                            label={t('label.cancel')}
                            isDisabled={isUploading}
                            onClick={handleClose}
                        />
                        <Button
                            variant="default"
                            size="big"
                            label={deployLabel}
                            isDisabled={!selectedFile || isUploading}
                            onClick={handleUpload}
                        />
                    </>
                )}
            </DialogActions>
        </Dialog>
    );
};

UploadModuleDialog.propTypes = {
    isOpen: PropTypes.bool,
    onClose: PropTypes.func,
    onDeploySuccess: PropTypes.func
};

export default UploadModuleDialog;
