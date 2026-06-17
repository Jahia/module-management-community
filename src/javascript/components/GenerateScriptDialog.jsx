import React, {useCallback, useMemo, useState} from 'react';
import * as PropTypes from 'prop-types';
import {Button, Switch, Typography} from '@jahia/moonstone';
import {Dialog, DialogActions, DialogContent, DialogTitle} from '@material-ui/core';
import {useMutation} from '@apollo/client';
import gql from 'graphql-tag';
import {useTranslation} from 'react-i18next';
import {DryRunResultDialog} from './DryRunResultDialog';
import styles from './GenerateScriptDialog.scss';

const GENERATE_SCRIPT_MUTATION = gql`mutation ($symbolicNames: [String]!) {
    admin { modulesManagement { generateProvisioningScript(symbolicNames: $symbolicNames) } }
}`;

const TYPE_OPTIONS = [
    {key: 'module', labelKey: 'label.generateScript.type.module'},
    {key: 'system', labelKey: 'label.generateScript.type.system'},
    {key: 'templatesSet', labelKey: 'label.generateScript.type.templatesSet'}
];

export const GenerateScriptDialog = ({isOpen, onClose, modules, bundleTypes}) => {
    const {t} = useTranslation('module-management-community');
    const [typeFilter, setTypeFilter] = useState(new Set(['module', 'system', 'templatesSet']));
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(new Set());
    const [scriptResult, setScriptResult] = useState(null); // {modules, yamlScript}
    const [isGenerating, setIsGenerating] = useState(false);

    const [generateScript] = useMutation(GENERATE_SCRIPT_MUTATION);

    // Build the candidate list: non-SNAPSHOT modules of selected types
    const candidates = useMemo(() => {
        if (!modules) {
            return [];
        }

        return modules.filter(m => {
            // Exclude SNAPSHOT versions
            if (m.version && m.version.toUpperCase().includes('SNAPSHOT')) {
                return false;
            }

            // Filter by type
            const type = bundleTypes?.[m.name];
            if (type && !typeFilter.has(type)) {
                return false;
            }

            // If type unknown, include by default (will be classified later)
            return true;
        });
    }, [modules, bundleTypes, typeFilter]);

    const filteredCandidates = useMemo(() => {
        const q = search.trim().toLowerCase();
        return q ? candidates.filter(m => m.name.toLowerCase().includes(q)) : candidates;
    }, [candidates, search]);

    const snapshotCount = useMemo(() => {
        if (!modules) {
            return 0;
        }

        return modules.filter(m => m.version && m.version.toUpperCase().includes('SNAPSHOT')).length;
    }, [modules]);

    // Initialise selection when dialog opens
    const handleOpen = useCallback(() => {
        setSelected(new Set(candidates.map(m => m.name)));
        setSearch('');
        setTypeFilter(new Set(['module', 'system', 'templatesSet']));
        setScriptResult(null);
    }, [candidates]);

    const toggleType = useCallback(type => {
        setTypeFilter(prev => {
            const next = new Set(prev);
            if (next.has(type)) {
                next.delete(type);
            } else {
                next.add(type);
            }

            return next;
        });
    }, []);

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
        setSelected(new Set(filteredCandidates.map(m => m.name)));
    }, [filteredCandidates]);

    const clearAll = useCallback(() => {
        setSelected(new Set());
    }, []);

    const handleGenerate = async () => {
        const names = Array.from(selected).filter(n => filteredCandidates.some(m => m.name === n));
        if (names.length === 0) {
            return;
        }

        setIsGenerating(true);
        try {
            const result = await generateScript({variables: {symbolicNames: names}});
            const yaml = result?.data?.admin?.modulesManagement?.generateProvisioningScript;
            setScriptResult({modules: names, yamlScript: yaml});
        } catch (e) {
            console.error('Error generating provisioning script:', e);
        } finally {
            setIsGenerating(false);
        }
    };

    const visibleSelected = filteredCandidates.filter(m => selected.has(m.name)).length;

    return (
        <>
            <Dialog
                fullWidth
                open={isOpen}
                maxWidth="md"
                data-testid="generate-script-dialog"
                onClose={onClose}
                onEnter={handleOpen}
            >
                <DialogTitle disableTypography>
                    <Typography variant="title">{t('label.generateScript.title')}</Typography>
                    <Typography variant="body" className={styles.subtitle}>
                        {t('label.generateScript.subtitle')}
                    </Typography>
                </DialogTitle>

                <DialogContent className={styles.content}>
                    {/* Type filter row */}
                    <div className={styles.typeRow}>
                        <Typography variant="caption" className={styles.typeLabel}>
                            {t('label.generateScript.includeTypes')}
                        </Typography>
                        {TYPE_OPTIONS.map(({key, labelKey}) => (
                            <label key={key} className={styles.typeChip}>
                                <Switch
                                    checked={typeFilter.has(key)}
                                    onChange={() => toggleType(key)}
                                />
                                <Typography variant="body">{t(labelKey)}</Typography>
                            </label>
                        ))}
                    </div>

                    {/* Search + select all/none */}
                    <div className={styles.searchRow}>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder={t('label.generateScript.searchPlaceholder')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <Button variant="ghost"
                                size="small"
                                label={t('label.generateScript.selectAll')}
                                onClick={selectAll}/>
                        <Button variant="ghost"
                                size="small"
                                label={t('label.generateScript.clearAll')}
                                onClick={clearAll}/>
                    </div>

                    {/* Module list */}
                    <div className={styles.moduleList}>
                        {filteredCandidates.length === 0 ? (
                            <Typography variant="body" className={styles.empty}>
                                {t('label.generateScript.empty')}
                            </Typography>
                        ) : (
                            filteredCandidates.map(m => {
                                const type = bundleTypes?.[m.name] || 'bundle';
                                const isChecked = selected.has(m.name);
                                return (
                                    <label key={m.name}
                                           className={`${styles.moduleRow} ${isChecked ? styles.moduleRowChecked : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            className={styles.checkbox}
                                            checked={isChecked}
                                            onChange={() => toggleModule(m.name)}
                                        />
                                        <Typography variant="body" className={styles.moduleName}>{m.name}</Typography>
                                        <span className={`${styles.badge} ${styles[`badge_${type}`]}`}>
                                            {m.version}
                                        </span>
                                        <span className={`${styles.typeBadge} ${styles[`type_${type}`]}`}>
                                            {type}
                                        </span>
                                    </label>
                                );
                            })
                        )}
                    </div>

                    {/* Summary */}
                    <Typography variant="caption" className={styles.summary}>
                        {t('label.generateScript.summary', {
                            selected: visibleSelected,
                            total: filteredCandidates.length,
                            snapshots: snapshotCount
                        })}
                    </Typography>
                </DialogContent>

                <DialogActions className={styles.actions}>
                    <Button variant="ghost" size="big" label={t('label.cancel')} onClick={onClose}/>
                    <Button
                        variant="outlined"
                        size="big"
                        color="accent"
                        label={isGenerating ? t('label.generateScript.generating') : t('label.generateScript.generate')}
                        isDisabled={visibleSelected === 0 || isGenerating}
                        onClick={handleGenerate}
                    />
                </DialogActions>
            </Dialog>

            {/* Reuse DryRunResultDialog to show the YAML */}
            <DryRunResultDialog
                isOpen={Boolean(scriptResult)}
                title={t('label.generateScript.result.title')}
                modules={scriptResult?.modules}
                yamlScript={scriptResult?.yamlScript}
                onClose={() => {
                    setScriptResult(null);
                    onClose();
                }}
            />
        </>
    );
};

GenerateScriptDialog.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    modules: PropTypes.arrayOf(PropTypes.shape({
        name: PropTypes.string,
        version: PropTypes.string
    })),
    bundleTypes: PropTypes.object
};

