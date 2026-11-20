import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import * as PropTypes from 'prop-types';
import {Button, ButtonToggle, Chip, Modal, ModalBody, ModalFooter, ModalHeader, Typography} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import styles from './DryRunResultDialog.scss';

const SUBTITLE_ID = 'dryrun-result-dialog-subtitle';

const buildCurlCommand = yamlScript => {
    const host = window.location.origin;
    // <<'YAML' is a literal heredoc — no shell interpretation, no escaping needed
    return `curl -s -u "<user>:<password>" \\
  -X POST "${host}/modules/api/provisioning" \\
  -H "Content-Type: application/yaml" \\
  --data-binary @- <<'YAML'\n${yamlScript || ''}YAML`;
};

const writeToClipboard = text => {
    if (!navigator.clipboard?.writeText) {
        return Promise.reject(new Error('Clipboard API unavailable'));
    }

    return navigator.clipboard.writeText(text);
};

export const DryRunResultDialog = ({isOpen, onClose, modules, yamlScript, title}) => {
    const {t} = useTranslation('module-management-community');
    const [viewMode, setViewMode] = useState('yaml'); // 'yaml' | 'curl'
    const [copyMessage, setCopyMessage] = useState('');
    const copyTimer = useRef(null);

    const curlCommand = useMemo(() => buildCurlCommand(yamlScript), [yamlScript]);
    const isYaml = viewMode === 'yaml';
    const activeContent = isYaml ? yamlScript : curlCommand;

    const clearCopyTimer = () => {
        if (copyTimer.current) {
            clearTimeout(copyTimer.current);
            copyTimer.current = null;
        }
    };

    useEffect(() => clearCopyTimer, []);

    const handleCopy = useCallback(() => {
        const successMessage = isYaml ? t('label.dryRun.dialog.copiedYaml') : t('label.dryRun.dialog.copiedCurl');
        const showMessage = message => {
            // Empty the region first, so a second identical message is announced again
            clearCopyTimer();
            setCopyMessage('');
            copyTimer.current = setTimeout(() => setCopyMessage(message), 100);
        };

        writeToClipboard(activeContent).then(
            () => showMessage(successMessage),
            () => showMessage(t('label.dryRun.dialog.copyFailed'))
        );
    }, [activeContent, isYaml, t]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([activeContent], {type: isYaml ? 'text/yaml' : 'text/x-sh'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = isYaml ? 'provisioning.yaml' : 'deploy.sh';
        a.click();
        URL.revokeObjectURL(url);
    }, [activeContent, isYaml]);

    const handleViewChange = mode => {
        setViewMode(mode);
        clearCopyTimer();
        setCopyMessage('');
    };

    // Reset to yaml view each time the dialog opens, before it paints
    useLayoutEffect(() => {
        if (isOpen) {
            setViewMode('yaml');
            clearCopyTimer();
            setCopyMessage('');
        }
    }, [isOpen]);

    return (
        <Modal isOpen={isOpen}
               size="full"
               className={styles.modal}
               aria-labelledby={undefined}
               aria-label={title || t('label.dryRun.dialog.title')}
               aria-describedby={SUBTITLE_ID}
               data-testid="dryrun-result-dialog"
               onOpenChange={open => !open && onClose()}
        >
            <>
                {/* The header wraps the title and the subtitle: the dialog takes the title as name, the subtitle as description */}
                <ModalHeader title={title || t('label.dryRun.dialog.title')}>
                    <span id={SUBTITLE_ID}>{t('label.dryRun.dialog.subtitle', {count: modules?.length ?? 0})}</span>
                </ModalHeader>

                <ModalBody>
                    {(!modules || modules.length === 0) ? (
                        <Typography variant="body">{t('label.dryRun.dialog.noUpdates')}</Typography>
                    ) : (
                        <>
                            {/* Module chips */}
                            <div className={styles.moduleList}>
                                {modules.map(m => (
                                    <Chip key={m} label={m} color="default"/>
                                ))}
                            </div>

                            {/* Header: view toggle + actions */}
                            <div className={styles.yamlHeader}>
                                {/* A11y A-015: each ButtonToggle communicates its state with aria-pressed */}
                                <div className={styles.viewToggle}>
                                    <ButtonToggle label="YAML"
                                                  isPressed={isYaml}
                                                  onClick={() => handleViewChange('yaml')}/>
                                    <ButtonToggle label="cURL"
                                                  isPressed={!isYaml}
                                                  onClick={() => handleViewChange('curl')}/>
                                </div>

                                {/* Action buttons: the copy label names what it copies */}
                                <div className={styles.yamlActions}>
                                    <Button
                                        variant="ghost"
                                        size="small"
                                        label={isYaml ? t('label.dryRun.dialog.copy') : t('label.dryRun.dialog.copyCurl')}
                                        onClick={handleCopy}
                                    />
                                    <Button
                                        variant="ghost"
                                        size="small"
                                        label={isYaml ?
                                            t('label.dryRun.dialog.download') :
                                            t('label.dryRun.dialog.downloadSh')}
                                        onClick={handleDownload}
                                    />
                                </div>
                            </div>

                            {/* Copy result: visible, and announced politely */}
                            <div role="status" className={styles.copyStatus}>
                                {copyMessage}
                            </div>

                            {/* cURL hint */}
                            {!isYaml && (
                                <Typography isItalic variant="caption" className={styles.curlHint}>
                                    {t('label.dryRun.dialog.curlHint')}
                                </Typography>
                            )}

                            {/* A11y A-028: labelled, keyboard-scrollable code block */}
                            <pre className={styles.yaml}
                                 role="region"
                                 tabIndex={0}
                                 aria-label={isYaml ? t('label.dryRun.dialog.yamlAriaLabel') : t('label.dryRun.dialog.curlAriaLabel')}
                            >{activeContent}
                            </pre>
                        </>
                    )}
                </ModalBody>

                <ModalFooter>
                    <Button variant="outlined"
                            size="big"
                            color="accent"
                            label={t('label.close')}
                            onClick={onClose}/>
                </ModalFooter>
            </>
        </Modal>
    );
};

DryRunResultDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    modules: PropTypes.arrayOf(PropTypes.string),
    yamlScript: PropTypes.string,
    title: PropTypes.string
};
