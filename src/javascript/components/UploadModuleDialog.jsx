import React, {useCallback, useRef, useState} from 'react';
import {
    Button,
    Loader,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    RadioGroup,
    RadioItem,
    Separator,
    Typography
} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './UploadModuleDialog.scss';
import PropTypes from 'prop-types';

const UPLOAD_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/upload`;
const IMPORT_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/import`;

// The modal is named by its header
const TITLE_ID = 'upload-module-dialog-title';

// Per-mode configuration. Keeps the component free of long ternary chains
// (lower cognitive complexity) and centralises the accepted file types so the
// drop-zone aria-label can reflect the currently accepted extension (A11y HIGH-9).
const MODE_CONFIG = {
    jar: {
        accept: '.jar,.tgz',
        icon: '📦',
        emojiLabel: 'JAR or TGZ file',
        extensions: '.jar, .tgz',
        dropzoneKey: 'label.upload.dialog.dropzone',
        deployKey: 'label.upload.dialog.deploy',
        uploadingKey: 'label.upload.dialog.deploying',
        hintKey: 'label.upload.dialog.hint',
        validationKey: 'label.upload.validation.notJar',
        isValid: name => name.endsWith('.jar') || name.endsWith('.tgz')
    },
    zip: {
        accept: '.zip',
        icon: '🗜️',
        emojiLabel: 'ZIP archive',
        extensions: '.zip',
        dropzoneKey: 'label.import.dialog.dropzone',
        deployKey: 'label.import.dialog.import',
        uploadingKey: 'label.import.dialog.importing',
        hintKey: 'label.import.dialog.hint',
        validationKey: 'label.import.validation.notZip',
        isValid: name => name.endsWith('.zip')
    },
    yaml: {
        accept: '.yaml,.yml',
        icon: '📄',
        emojiLabel: 'YAML file',
        extensions: '.yaml, .yml',
        dropzoneKey: 'label.yaml.dialog.dropzone',
        deployKey: 'label.yaml.dialog.apply',
        uploadingKey: 'label.yaml.dialog.applying',
        hintKey: 'label.yaml.dialog.hint',
        validationKey: 'label.yaml.validation.notYaml',
        isValid: name => name.endsWith('.yaml') || name.endsWith('.yml')
    }
};

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

    // 'jar' = deploy single module | 'zip' = import snapshot archive | 'yaml' = apply provisioning script
    const [mode, setMode] = useState('jar');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    // 'idle' | 'uploading' | 'success' | 'error'
    const [status, setStatus] = useState('idle');
    const [statusMessage, setStatusMessage] = useState('');

    const isZipMode = mode === 'zip';
    const config = MODE_CONFIG[mode] || MODE_CONFIG.jar;

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

        if (!config.isValid(file.name.toLowerCase())) {
            return t(config.validationKey);
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

    const dropzoneLabel = t(config.dropzoneKey);
    const deployLabel = t(config.deployKey);
    const uploadingLabel = t(config.uploadingKey);
    const hintLabel = t(config.hintKey);

    const fileIcon = config.icon;
    const acceptAttr = config.accept;

    // A11y HIGH-9: aria-label reflects the currently-accepted file type
    const dropzoneAriaLabel = t('label.upload.dropzone.ariaLabel', {
        types: config.extensions,
        defaultValue: `Select or drop a ${config.extensions} file`
    });

    // Escape and a click outside the modal close it, except while the upload runs
    const handleOpenChange = open => {
        if (!open && !isUploading) {
            handleClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            size="large"
            data-testid="upload-module-dialog"
            aria-labelledby={TITLE_ID}
            onOpenChange={handleOpenChange}
        >
            <>
                <ModalHeader id={TITLE_ID} title={t('label.upload.dialog.title')}/>

                <ModalBody className={styles.dialogContent}>
                    {/* Mode selector */}
                    <RadioGroup
                        name="upload-mode"
                        role="radiogroup"
                        aria-labelledby={TITLE_ID}
                        value={mode}
                        isDisabled={isUploading}
                        onChange={(e, value) => handleModeChange(value)}
                    >
                        <RadioItem id="upload-mode-jar" value="jar" label={t('label.upload.mode.jar')}/>
                        <RadioItem id="upload-mode-zip" value="zip" label={t('label.upload.mode.zip')}/>
                        <RadioItem id="upload-mode-yaml" value="yaml" label={t('label.upload.mode.yaml')}/>
                    </RadioGroup>

                    <Separator spacing="none" size="full"/>

                    {/* A11y A-004: drop zone is keyboard accessible */}
                    {!isSuccess && (
                        <div
                            role="button"
                            tabIndex={0}
                            aria-label={dropzoneAriaLabel}
                            aria-describedby="upload-dropzone-hint"
                            className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''} ${selectedFile ? styles.dropZoneSelected : ''}`}
                            onClick={() => fileInputRef.current?.click()}
                            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={acceptAttr}
                                className={styles.hiddenInput}
                                onChange={handleFileInputChange}
                            />
                            {selectedFile ? (
                                <>
                                    <Typography variant="body" weight="semiBold" className={styles.fileName}>
                                        {/* A11y A-013: emoji with role="img" */}
                                        <span role="img" aria-label={config.emojiLabel}>
                                            {fileIcon}
                                        </span>
                                        {' '}{selectedFile.name}
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

                    {/* A11y A-009: status feedback as live regions; A-013: emoji with aria role */}
                    {isUploading && (
                        <div className={styles.statusRow} role="status" aria-live="polite">
                            <Loader size="small"/>
                            <Typography variant="body">{uploadingLabel}</Typography>
                        </div>
                    )}

                    {status === 'success' && (
                        <div className={`${styles.statusRow} ${styles.statusSuccess}`} role="status" aria-live="polite">
                            <Typography variant="body">
                                <span role="img" aria-label="Success">✅</span> {statusMessage}
                            </Typography>
                        </div>
                    )}

                    {status === 'error' && (
                        <div className={`${styles.statusRow} ${styles.statusError}`} role="alert" aria-live="assertive">
                            <Typography variant="body">
                                <span role="img" aria-label="Warning">⚠️</span> {statusMessage}
                            </Typography>
                        </div>
                    )}

                    {/* Helper text — referenced by the drop zone via aria-describedby (A11y HIGH-9) */}
                    {!isSuccess && (
                        <Typography id="upload-dropzone-hint" variant="caption" className={styles.helperText}>
                            {hintLabel}
                        </Typography>
                    )}
                </ModalBody>

                {/* The footer lays its children out right to left: the primary action comes first */}
                <ModalFooter>
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
                </ModalFooter>
            </>
        </Modal>
    );
};

UploadModuleDialog.propTypes = {
    isOpen: PropTypes.bool,
    onClose: PropTypes.func,
    onDeploySuccess: PropTypes.func
};

export default UploadModuleDialog;
