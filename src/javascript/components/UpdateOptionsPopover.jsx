import React, {useCallback} from 'react';
import * as PropTypes from 'prop-types';
import {Banner, Button, Modal, ModalBody, ModalFooter, ModalHeader, Separator, Switch, Typography} from '@jahia/moonstone';
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

export const isNonDefault = prefs => Object.keys(DEFAULTS).some(k => prefs[k] !== DEFAULTS[k]);

const OPTION_META = [
    {key: 'dryRun', labelKey: 'label.input.dryRun', descKey: 'label.input.dryRunDesc'},
    {key: 'autostart', labelKey: 'label.input.autostart', descKey: 'label.input.autostartDesc'},
    {key: 'uninstallPrevious', labelKey: 'label.input.uninstallPrevious', descKey: 'label.input.uninstallPreviousDesc'},
    {key: 'onStartup', labelKey: 'label.input.onStartup', descKey: 'label.input.onStartupDesc'}
];

/** The update options, opened from the ⋮ menu of the action bar. */
export const UpdateOptionsPopover = ({preferences, onPreferencesChange, isOpen, onClose}) => {
    const {t} = useTranslation('module-management-community');

    const handleSwitch = useCallback((key, checked) => {
        onPreferencesChange({...preferences, [key]: checked});
    }, [preferences, onPreferencesChange]);

    const applyPreset = useCallback(presetKey => {
        onPreferencesChange({...preferences, ...PRESETS[presetKey]});
    }, [preferences, onPreferencesChange]);

    return (
        <Modal isOpen={isOpen}
               size="small"
               id="update-options-popover"
               aria-labelledby="update-options-title"
               data-testid="update-options-dialog"
               onOpenChange={open => !open && onClose()}
        >
            <>
                <ModalHeader id="update-options-title" title={t('label.input.group.updateOptions')}/>
                <ModalBody className={styles.body}>
                    <div className={styles.presets}>
                        <Typography variant="caption" className={styles.secondary}>
                            {t('label.input.presets.label')}
                        </Typography>
                        <div className={styles.presetBtns}>
                            <Button variant="outlined"
                                    color="accent"
                                    label={t('label.input.presets.safe')}
                                    title={t('label.input.presets.safeDesc')}
                                    onClick={() => applyPreset('safe')}/>
                            <Button variant="outlined"
                                    color="danger"
                                    label={t('label.input.presets.apply')}
                                    title={t('label.input.presets.applyDesc')}
                                    onClick={() => applyPreset('apply')}/>
                        </div>
                    </div>

                    {!preferences.dryRun && (
                        <Banner variant="warning" title={t('label.input.dryRun')}>
                            {t('label.updateAllLiveTooltip')}
                        </Banner>
                    )}

                    <Separator spacing="none"/>

                    {OPTION_META.map(({key, labelKey, descKey}) => (
                        <div key={key} className={styles.option}>
                            <div className={styles.switchLabelRow}>
                                {/* A11y A-008: aria-label associates the switch with its label text */}
                                <Switch checked={preferences[key]}
                                        aria-label={t(labelKey)}
                                        onChange={(e, value, checked) => handleSwitch(key, checked)}/>
                                <Typography variant="body" aria-hidden="true">{t(labelKey)}</Typography>
                            </div>
                            <Typography variant="caption" className={styles.secondary}>{t(descKey)}</Typography>
                        </div>
                    ))}

                    <Separator spacing="none"/>
                    <Typography variant="caption" className={styles.secondary}>
                        {t('label.input.settings.persisted')}
                    </Typography>
                </ModalBody>
                <ModalFooter>
                    <Button variant="default"
                            color="accent"
                            size="big"
                            label={t('label.close')}
                            data-testid="update-options-close"
                            onClick={onClose}/>
                </ModalFooter>
            </>
        </Modal>
    );
};

UpdateOptionsPopover.propTypes = {
    preferences: PropTypes.shape({
        dryRun: PropTypes.bool,
        autostart: PropTypes.bool,
        uninstallPrevious: PropTypes.bool,
        onStartup: PropTypes.bool
    }).isRequired,
    onPreferencesChange: PropTypes.func.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};
