import React, {useCallback, useState} from 'react';
import * as PropTypes from 'prop-types';
import {Button, Typography} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import {useTranslation} from 'react-i18next';
import styles from './DryRunResultDialog.scss';

export const DryRunResultDialog = ({isOpen, onClose, modules, yamlScript, title}) => {
    const {t} = useTranslation('module-management-community');
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(yamlScript).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [yamlScript]);

    const handleDownload = useCallback(() => {
        const blob = new Blob([yamlScript], {type: 'text/yaml'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'module-update-preview.yaml';
        a.click();
        URL.revokeObjectURL(url);
    }, [yamlScript]);

    return (
        <Dialog open={isOpen} maxWidth="md" fullWidth onClose={onClose} data-testid="dryrun-result-dialog">
            <DialogTitle disableTypography>
                <Typography variant="title">{title || t('label.dryRun.dialog.title')}</Typography>
                <Typography variant="body" className={styles.subtitle}>
                    {t('label.dryRun.dialog.subtitle', {count: modules?.length ?? 0})}
                </Typography>            </DialogTitle>
            <DialogContent className={styles.content}>
                {(!modules || modules.length === 0) ? (
                    <Typography variant="body">{t('label.dryRun.dialog.noUpdates')}</Typography>
                ) : (
                    <>
                        <div className={styles.moduleList}>
                            {modules.map(m => (
                                <Typography key={m} variant="caption" className={styles.moduleChip}>{m}</Typography>
                            ))}
                        </div>
                        <div className={styles.yamlHeader}>
                            <Typography variant="subheading" weight="semiBold">
                                {t('label.dryRun.dialog.scriptLabel')}
                            </Typography>
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
                                    label={t('label.dryRun.dialog.download')}
                                    onClick={handleDownload}
                                />
                            </div>
                        </div>
                        <pre className={styles.yaml}>{yamlScript}</pre>
                    </>
                )}
            </DialogContent>
            <DialogActions className={styles.actions}>
                <Button
                    variant="outlined"
                    size="big"
                    color="accent"
                    label={t('label.close')}
                    onClick={onClose}
                />
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

