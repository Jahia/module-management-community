import {useEffect} from 'react';

/**
 * Calls onEscape when the user presses Escape while isActive is true.
 * Moonstone Menu does not close on Escape, and the focus stays on the button that opened it.
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
