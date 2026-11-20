import React, {useCallback, useEffect, useRef, useState} from 'react';
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
import {focusFooterAction, focusLater} from './dialogFocus';

const UPLOAD_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/upload`;
const IMPORT_URL = `${window.contextJsParameters?.contextPath || ''}/modules/module-management-community/import`;

// The modal is named by its header
const TITLE_ID = 'upload-module-dialog-title';
const MODE_LABEL_ID = 'upload-module-dialog-mode-label';
const HINT_ID = 'upload-dropzone-hint';
const SELECTED_HINT_ID = 'upload-dropzone-selected-hint';

const formatSize = bytes => (bytes / 1024 / 1024).toFixed(2);

// Per-mode configuration. Keeps the component free of long ternary chains
// (lower cognitive complexity) and centralises the accepted file types.
const MODE_CONFIG = {
    jar: {
        accept: '.jar,.tgz',
        icon: '📦',
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
        dropzoneKey: 'label.yaml.dialog.dropzone',
        deployKey: 'label.yaml.dialog.apply',
        uploadingKey: 'label.yaml.dialog.applying',
        hintKey: 'label.yaml.dialog.hint',
        validationKey: 'label.yaml.validation.notYaml',
        isValid: name => name.endsWith('.yaml') || name.endsWith('.yml')
    }
};

// Text of the polite status region: progress, result, or the file just selected
const getPoliteMessage = ({isUploading, isSuccess, uploadingLabel, statusMessage, selectionMessage}) => {
    if (isUploading) {
        return uploadingLabel;
    }

    return isSuccess ? statusMessage : selectionMessage;
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
    const footerRef = useRef(null);
    const statusRef = useRef(null);
    // Set when the user starts an upload, so focus follows the result of that action only
    const followUploadFocus = useRef(false);

    // 'jar' = deploy single module | 'zip' = import snapshot archive | 'yaml' = apply provisioning script
    const [mode, setMode] = useState('jar');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    // 'idle' | 'uploading' | 'success' | 'error'
    const [status, setStatus] = useState('idle');
    const [statusMessage, setStatusMessage] = useState('');
    // Polite confirmation of the file the user picked or dropped
    const [selectionMessage, setSelectionMessage] = useState('');

    const isZipMode = mode === 'zip';
    const config = MODE_CONFIG[mode] || MODE_CONFIG.jar;

    const resetState = () => {
        setSelectedFile(null);
        setStatus('idle');
        setStatusMessage('');
        setSelectionMessage('');
        setIsDragging(false);
        followUploadFocus.current = false;
    };

    const handleModeChange = newMode => {
        setMode(newMode);
        resetState();
    };

    const handleSuccessClose = () => {
        resetState();
        onDeploySuccess();
    };

    const handleClose = () => {
        if (status === 'success') {
            // Escape on the success screen must refresh the list too
            handleSuccessClose();
            return;
        }

        resetState();
        onClose();
    };

    // The pressed Deploy button is disabled, then replaced by Close: move focus with the result
    useEffect(() => {
        if (!followUploadFocus.current) {
            return;
        }

        if (status === 'uploading') {
            focusLater(() => statusRef.current);
        } else if (status === 'success') {
            followUploadFocus.current = false;
            focusFooterAction(footerRef, 'close');
        } else if (status === 'error') {
            followUploadFocus.current = false;
            focusFooterAction(footerRef, 'deploy');
        }
    }, [status]);

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
            setSelectionMessage('');
        } else {
            setSelectedFile(file);
            setStatus('idle');
            setStatusMessage('');
            setSelectionMessage(t('label.upload.dropzone.selected', {
                fileName: file.name,
                size: formatSize(file.size),
                interpolation: {escapeValue: false}
            }));
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

        followUploadFocus.current = true;
        setStatus('uploading');
        setStatusMessage('');
        setSelectionMessage('');

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
            setStatusMessage(json.message || t('label.upload.success', {fileName: selectedFile.name, interpolation: {escapeValue: false}}));
        } catch (err) {
            setStatus('error');
            setStatusMessage(err.message || t('label.upload.error.generic'));
        }
    };

    const isUploading = status === 'uploading';
    const isSuccess = status === 'success';

    const dropzoneLabel = t(config.dropzoneKey);
    const deployLabel = t(config.deployKey);
    const uploadingLabel = t(config.uploadingKey);
    const hintLabel = t(config.hintKey);

    const fileIcon = config.icon;
    const acceptAttr = config.accept;

    const openFilePicker = () => fileInputRef.current?.click();

    const handleDropzoneDrop = e => {
        if (isUploading) {
            e.preventDefault();
            return;
        }

        handleDrop(e);
    };

    // Escape and a click outside the modal close it, except while the upload runs
    const handleOpenChange = open => {
        if (!open && !isUploading) {
            handleClose();
        }
    };

    const dropzoneDescribedBy = selectedFile ? `${SELECTED_HINT_ID} ${HINT_ID}` : HINT_ID;

    const politeMessage = getPoliteMessage({isUploading, isSuccess, uploadingLabel, statusMessage, selectionMessage});

    const hasStatusRow = isUploading || isSuccess;

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
                    {/* Mode selector, named by its own visible label */}
                    <div className={styles.modeGroup}>
                        <Typography id={MODE_LABEL_ID} variant="body" weight="semiBold">
                            {t('label.upload.mode.label')}
                        </Typography>
                        <RadioGroup
                            name="upload-mode"
                            role="radiogroup"
                            aria-labelledby={MODE_LABEL_ID}
                            value={mode}
                            isDisabled={isUploading}
                            onChange={(e, value) => handleModeChange(value)}
                        >
                            <RadioItem id="upload-mode-jar" value="jar" label={t('label.upload.mode.jar')}/>
                            <RadioItem id="upload-mode-zip" value="zip" label={t('label.upload.mode.zip')}/>
                            <RadioItem id="upload-mode-yaml" value="yaml" label={t('label.upload.mode.yaml')}/>
                        </RadioGroup>
                    </div>

                    <Separator spacing="none" size="full"/>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={acceptAttr}
                        className={styles.hiddenInput}
                        tabIndex={-1}
                        aria-hidden="true"
                        onChange={handleFileInputChange}
                    />

                    {/* The drop zone is a native button: its name is its visible text, file name and size included */}
                    {!isSuccess && (
                        <button
                            type="button"
                            disabled={isUploading}
                            aria-describedby={dropzoneDescribedBy}
                            className={`${styles.dropZone} ${isDragging ? styles.dropZoneDragging : ''} ${selectedFile ? styles.dropZoneSelected : ''}`}
                            onClick={openFilePicker}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDropzoneDrop}
                        >
                            {selectedFile ? (
                                <>
                                    <Typography component="span" variant="body" weight="semiBold" className={styles.fileName}>
                                        <span aria-hidden="true">{fileIcon}</span>
                                        {' '}{selectedFile.name}
                                    </Typography>
                                    <Typography component="span" variant="caption" className={styles.fileSize}>
                                        {t('label.upload.dropzone.fileSize', {size: formatSize(selectedFile.size), interpolation: {escapeValue: false}})}
                                    </Typography>
                                    <span id={SELECTED_HINT_ID} className={styles.srOnly}>
                                        {t('label.upload.dropzone.selectAnother')}
                                    </span>
                                </>
                            ) : (
                                <Typography component="span" variant="body" className={styles.dropZoneHint}>
                                    {dropzoneLabel}
                                </Typography>
                            )}
                        </button>
                    )}

                    {/* Both regions stay mounted, so a screen reader hears every change of their text */}
                    <div
                        ref={statusRef}
                        role="status"
                        tabIndex={-1}
                        className={hasStatusRow ? `${styles.statusRow} ${isSuccess ? styles.statusSuccess : ''}` : styles.srOnly}
                    >
                        {isUploading && <Loader size="small"/>}
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

                    <div role="alert" className={status === 'error' ? `${styles.statusRow} ${styles.statusError}` : styles.srOnly}>
                        {status === 'error' && (
                            <Typography variant="body" component="span">
                                <span role="img" aria-label={t('label.dialogs.status.error')}>⚠️</span> {statusMessage}
                            </Typography>
                        )}
                    </div>

                    {/* Helper text, the description of the drop zone */}
                    {!isSuccess && (
                        <Typography id={HINT_ID} variant="caption" className={styles.helperText}>
                            {hintLabel}
                        </Typography>
                    )}
                </ModalBody>

                {/* The footer lays its children out right to left: the primary action comes first */}
                <ModalFooter ref={footerRef}>
                    {isSuccess ? (
                        <Button
                            variant="default"
                            size="big"
                            label={t('label.close')}
                            data-focus="close"
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
                                data-focus="deploy"
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
