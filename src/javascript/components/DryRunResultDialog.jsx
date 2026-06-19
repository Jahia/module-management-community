import React, {useCallback, useMemo, useState} from 'react';
import * as PropTypes from 'prop-types';
import {Button, Typography} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import {useTranslation} from 'react-i18next';
import styles from './DryRunResultDialog.scss';

const buildCurlCommand = yamlScript => {
    const host = window.location.origin;
    // <<'YAML' is a literal heredoc — no shell interpretation, no escaping needed
    return `curl -s -u "<user>:<password>" \\
  -X POST "${host}/modules/api/provisioning" \\
  -H "Content-Type: application/yaml" \\
  --data-binary @- <<'YAML'\n${yamlScript || ''}YAML`;
};

export const DryRunResultDialog = ({isOpen, onClose, modules, yamlScript, title}) => {
    const {t} = useTranslation('module-management-community');
    const [viewMode, setViewMode] = useState('yaml'); // 'yaml' | 'curl'
    const [copied, setCopied] = useState(false);

    const curlCommand = useMemo(() => buildCurlCommand(yamlScript), [yamlScript]);
    const activeContent = viewMode === 'yaml' ? yamlScript : curlCommand;

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(activeContent).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [activeContent]);

    const handleDownload = useCallback(() => {
        const isYaml = viewMode === 'yaml';
        const blob = new Blob([activeContent], {type: isYaml ? 'text/yaml' : 'text/x-sh'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = isYaml ? 'provisioning.yaml' : 'deploy.sh';
        a.click();
        URL.revokeObjectURL(url);
    }, [activeContent, viewMode]);

    // Reset to yaml view each time the dialog opens
    const handleEnter = useCallback(() => {
        setViewMode('yaml');
        setCopied(false);
    }, []);

    return (
        <Dialog fullWidth
                open={isOpen}
                maxWidth="md"
                data-testid="dryrun-result-dialog"
                onClose={onClose}
                onEnter={handleEnter}
        >
            <DialogTitle disableTypography>
                <Typography variant="title">{title || t('label.dryRun.dialog.title')}</Typography>
                <Typography variant="body" className={styles.subtitle}>
                    {t('label.dryRun.dialog.subtitle', {count: modules?.length ?? 0})}
                </Typography>
            </DialogTitle>

            <DialogContent className={styles.content}>
                {(!modules || modules.length === 0) ? (
                    <Typography variant="body">{t('label.dryRun.dialog.noUpdates')}</Typography>
                ) : (
                    <>
                        {/* Module chips */}
                        <div className={styles.moduleList}>
                            {modules.map(m => (
                                <Typography key={m} variant="caption" className={styles.moduleChip}>{m}</Typography>
                            ))}
                        </div>

                        {/* Header: view toggle + actions */}
                        <div className={styles.yamlHeader}>
                            {/* A11y A-015: aria-pressed communicates toggle state */}
                            <div className={styles.viewToggle}>
                                <button
                                    type="button"
                                    aria-pressed={viewMode === 'yaml'}
                                    className={`${styles.toggleBtn} ${viewMode === 'yaml' ? styles.toggleBtnActive : ''}`}
                                    onClick={() => setViewMode('yaml')}
                                >
                                    YAML
                                </button>
                                <button
                                    type="button"
                                    aria-pressed={viewMode === 'curl'}
                                    className={`${styles.toggleBtn} ${viewMode === 'curl' ? styles.toggleBtnActive : ''}`}
                                    onClick={() => setViewMode('curl')}
                                >
                                    cURL
                                </button>
                            </div>

                            {/* Action buttons */}
                            <div className={styles.yamlActions}>
                                <Button
                                    variant="ghost"
                                    size="small"
                                    label={copied ? t('label.dryRun.dialog.copied') : t('label.dryRun.dialog.copy')}
                                    onClick={handleCopy}
                                />
                                <Button
                                    variant="ghost"
                                    size="small"
                                    label={viewMode === 'yaml' ?
                                        t('label.dryRun.dialog.download') :
                                        t('label.dryRun.dialog.downloadSh')}
                                    onClick={handleDownload}
                                />
                            </div>
                        </div>

                        {/* cURL hint */}
                        {viewMode === 'curl' && (
                            <Typography variant="caption" className={styles.curlHint}>
                                {t('label.dryRun.dialog.curlHint')}
                            </Typography>
                        )}

                        {/* A11y A-028: labelled, keyboard-scrollable code block */}
                        <pre className={styles.yaml}
                             tabIndex={0}
                             aria-label={viewMode === 'yaml' ? t('label.dryRun.dialog.yamlAriaLabel', 'Provisioning YAML script') : t('label.dryRun.dialog.curlAriaLabel', 'cURL deployment command')}
                        >{activeContent}
                        </pre>
                    </>
                )}
            </DialogContent>

            <DialogActions className={styles.actions}>
                <Button variant="outlined"
                        size="big"
                        color="accent"
                        label={t('label.close')}
                        onClick={onClose}/>
            </DialogActions>
        </Dialog>
    );
};

DryRunResultDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    modules: PropTypes.arrayOf(PropTypes.string),
    yamlScript: PropTypes.string,
    title: PropTypes.string
};
