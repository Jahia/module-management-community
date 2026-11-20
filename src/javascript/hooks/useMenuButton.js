import {useCallback, useRef, useState} from 'react';

/**
 * The state of a ⋮ button and the menu it opens.
 * anchorRef goes on the element that wraps the button: the moonstone Button does not forward a ref,
 * so the button is found inside it. Every close moves focus back to the button.
 */
export const useMenuButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [initialFocus, setInitialFocus] = useState('first');
    const anchorRef = useRef(null);

    const focusButton = useCallback(() => {
        const button = anchorRef.current && anchorRef.current.querySelector('button');
        if (button) {
            button.focus();
        }
    }, []);

    const open = useCallback((focusOn = 'first') => {
        setInitialFocus(focusOn);
        setIsOpen(true);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        focusButton();
    }, [focusButton]);

    const toggle = useCallback(() => {
        if (isOpen) {
            close();
        } else {
            open('first');
        }
    }, [isOpen, open, close]);

    // ArrowDown and ArrowUp on the button open the menu on its first or last item.
    const onButtonKeyDown = useCallback(event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open(event.key === 'ArrowDown' ? 'first' : 'last');
        }
    }, [open]);

    return {isOpen, initialFocus, anchorRef, open, close, toggle, focusButton, onButtonKeyDown};
};

/**
 * Remembers the element that opens a dialog and gives it focus back when the dialog closes.
 * fallback returns the element to use when nothing had focus, such as after a click in Safari.
 */
export const useReturnFocus = fallback => {
    const openerRef = useRef(null);

    const remember = useCallback(() => {
        const active = document.activeElement;
        openerRef.current = active && active !== document.body ? active : (fallback && fallback());
    }, [fallback]);

    const restore = useCallback(() => {
        const opener = openerRef.current;
        openerRef.current = null;
        // The dialog unmounts in the next render, and its focus manager can move focus on unmount;
        // waiting one frame lets the opener get focus last.
        requestAnimationFrame(() => {
            if (opener && opener.isConnected) {
                opener.focus();
            }
        });
    }, []);

    return {remember, restore};
};
