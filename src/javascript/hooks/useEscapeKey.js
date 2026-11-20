import {useEffect} from 'react';

/**
 * Calls onEscape when the user presses Escape while isActive is true.
 * The moonstone Menu does not close on Escape. AccessibleMenu handles Escape inside the menu;
 * this document listener also covers a menu opened with the mouse while focus is elsewhere.
 */
export const useEscapeKey = (isActive, onEscape) => {
    useEffect(() => {
        if (!isActive) {
            return undefined;
        }

        const listener = event => {
            if (event.key === 'Escape') {
                onEscape();
            }
        };

        document.addEventListener('keydown', listener);
        return () => document.removeEventListener('keydown', listener);
    }, [isActive, onEscape]);
};
