import {useCallback, useState} from 'react';

const PREFS_STORAGE_KEY = 'moduleManagement.updatePreferences';

const DEFAULTS = {
    dryRun: true,
    jahiaOnly: true,
    autostart: true,
    uninstallPrevious: true,
    updatesOnly: false,
    onStartup: false
};

const loadPreferences = () => {
    try {
        const saved = localStorage.getItem(PREFS_STORAGE_KEY);
        if (saved) {
            return {...DEFAULTS, ...JSON.parse(saved)};
        }
    } catch (_) { /* ignore */ }

    return {...DEFAULTS};
};

/**
 * Hook that manages update preferences with automatic localStorage persistence.
 * Returns [preferences, setPreferences].
 */
export const useModulePreferences = () => {
    const [preferences, setPreferencesRaw] = useState(loadPreferences);

    const setPreferences = useCallback(next => {
        setPreferencesRaw(next);
        try {
            localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
        } catch (_) { /* ignore */ }
    }, []);

    return [preferences, setPreferences];
};

