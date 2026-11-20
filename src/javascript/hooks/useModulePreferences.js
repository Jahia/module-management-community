import {useCallback, useEffect, useState} from 'react';

const PREFS_STORAGE_KEY = 'moduleManagement.updatePreferences';

const DEFAULTS = {
    dryRun: true,
    jahiaOnly: true,
    autostart: true,
    uninstallPrevious: true,
    updatesOnly: false,
    onStartup: false,
    autoRefresh: true, // A11y B-005: user-controllable auto-refresh
    probeSeverity: 'HIGH' // The Server status screen lists the probes of this severity and above
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

// One store for the whole bundle, so the Modules screen, the Server Status screen and the nav icon
// see a change at once, without a reload.
let current = null;
const listeners = new Set();

const getSnapshot = () => {
    if (current === null) {
        current = loadPreferences();
    }

    return current;
};

const publish = next => {
    current = next;
    listeners.forEach(listener => listener());
};

// Another tab of the same browser changed the preferences.
const onStorage = event => {
    if (event.key === PREFS_STORAGE_KEY) {
        publish(loadPreferences());
    }
};

const subscribe = listener => {
    listeners.add(listener);
    if (listeners.size === 1 && typeof window !== 'undefined') {
        window.addEventListener('storage', onStorage);
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== 'undefined') {
            window.removeEventListener('storage', onStorage);
        }
    };
};

/**
 * Hook that manages update preferences with automatic localStorage persistence.
 * Every component that uses it shares the same preferences, live.
 * Returns [preferences, setPreferences].
 */
export const useModulePreferences = () => {
    const [preferences, setLocal] = useState(getSnapshot);

    useEffect(() => {
        const update = () => setLocal(getSnapshot());
        const unsubscribe = subscribe(update);
        // A change published between the first render and this subscription.
        update();
        return unsubscribe;
    }, []);

    const setPreferences = useCallback(next => {
        publish(next);
        try {
            localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
        } catch (_) { /* ignore */ }
    }, []);

    return [preferences, setPreferences];
};

