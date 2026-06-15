import React, {useCallback, useState} from 'react';
import * as PropTypes from 'prop-types';
import {Information, Switch, Tune, Typography} from '@jahia/moonstone';
import {Popover, Tooltip} from '@material-ui/core';
import {useTranslation} from 'react-i18next';
import styles from './UpdateOptionsPopover.scss';

const DEFAULTS = {
    dryRun: true,
    autostart: true,
    uninstallPrevious: true,
    onStartup: false
};

const PRESETS = {
    safe: {dryRun: true, autostart: true, uninstallPrevious: false, onStartup: false},
    apply: {dryRun: false, autostart: true, uninstallPrevious: true, onStartup: false}
};

const isNonDefault = prefs => Object.keys(DEFAULTS).some(k => prefs[k] !== DEFAULTS[k]);

const OPTION_META = [
    {key: 'dryRun', labelKey: 'label.input.dryRun', descKey: 'label.input.dryRunDesc', danger: true},
    {key: 'autostart', labelKey: 'label.input.autostart', descKey: 'label.input.autostartDesc'},
    {key: 'uninstallPrevious', labelKey: 'label.input.uninstallPrevious', descKey: 'label.input.uninstallPreviousDesc'},
    {key: 'onStartup', labelKey: 'label.input.onStartup', descKey: 'label.input.onStartupDesc'}
];

export const UpdateOptionsPopover = ({preferences, onPreferencesChange}) => {
    const {t} = useTranslation('module-management-community');
    const [anchorEl, setAnchorEl] = useState(null);
    const nonDefault = isNonDefault(preferences);

    const handleOpen = useCallback(e => setAnchorEl(e.currentTarget), []);
    const handleClose = useCallback(() => setAnchorEl(null), []);

    const handleSwitch = useCallback((key, checked) => {
        onPreferencesChange({...preferences, [key]: checked});
    }, [preferences, onPreferencesChange]);

    const applyPreset = useCallback(presetKey => {
        onPreferencesChange({...preferences, ...PRESETS[presetKey]});
    }, [preferences, onPreferencesChange]);

    return (
        <>
            <Tooltip title={t('label.input.group.updateOptions')} placement="bottom">
                <span>
                    <button
                        className={`${styles.tuneBtn} ${nonDefault ? styles.tuneBtnActive : ''}`}
                        type="button"
                        aria-label={t('label.input.group.updateOptions')}
                        data-testid="update-options-btn"
                        onClick={handleOpen}
                    >
                        <Tune/>
                        {nonDefault && <span className={styles.badge} aria-label={t('label.input.settings.modified')}/>}
                    </button>
                </span>
            </Tooltip>

            <Popover
                open={Boolean(anchorEl)}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{vertical: 'bottom', horizontal: 'right'}}
                transformOrigin={{vertical: 'top', horizontal: 'right'}}
            >
                <div className={styles.popover}>
                    <Typography variant="subheading" weight="bold" className={styles.popoverTitle}>
                        {t('label.input.group.updateOptions')}
                    </Typography>

                    {/* Presets */}
                    <div className={styles.presets}>
                        <Typography variant="caption" className={styles.presetsLabel}>
                            {t('label.input.presets.label')}
                        </Typography>
                        <div className={styles.presetBtns}>
                            <button
                                className={`${styles.presetBtn} ${styles.presetSafe}`}
                                type="button"
                                title={t('label.input.presets.safeDesc')}
                                onClick={() => applyPreset('safe')}
                            >
                                {t('label.input.presets.safe')}
                            </button>
                            <button
                                className={`${styles.presetBtn} ${styles.presetApply}`}
                                type="button"
                                title={t('label.input.presets.applyDesc')}
                                onClick={() => applyPreset('apply')}
                            >
                                {t('label.input.presets.apply')}
                            </button>
                        </div>
                    </div>

                    <hr className={styles.divider}/>

                    {/* Options with descriptions */}
                    {OPTION_META.map(({key, labelKey, descKey, danger}) => (
                        <div key={key}
                             className={`${styles.switchRow} ${danger && !preferences[key] ? styles.dangerRow : ''}`}>
                            <div className={styles.switchLabelRow}>
                                <Switch
                                    checked={preferences[key]}
                                    onChange={(e, value, checked) => handleSwitch(key, checked)}
                                />
                                <Typography variant="body" weight={danger ? 'semiBold' : 'default'}>
                                    {t(labelKey)}
                                </Typography>
                                <Tooltip title={t(descKey)} placement="right">
                                    <span className={styles.infoIcon}><Information/></span>
                                </Tooltip>
                            </div>
                            <Typography variant="caption" className={styles.desc}>
                                {t(descKey)}
                            </Typography>
                        </div>
                    ))}

                    <hr className={styles.divider}/>
                    <Typography variant="caption" className={styles.persistNote}>
                        {t('label.input.settings.persisted')}
                    </Typography>
                </div>
            </Popover>
        </>
    );
};

UpdateOptionsPopover.propTypes = {
    preferences: PropTypes.shape({
        dryRun: PropTypes.bool,
        autostart: PropTypes.bool,
        uninstallPrevious: PropTypes.bool,
        onStartup: PropTypes.bool
    }).isRequired,
    onPreferencesChange: PropTypes.func.isRequired
};
