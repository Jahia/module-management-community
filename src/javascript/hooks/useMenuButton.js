import {useCallback, useRef, useState} from 'react';

/**
 * The state of a ⋮ button and the menu it opens.
 * anchorRef goes on the element that wraps the button: the moonstone Button does not forward a ref,
 * so getButton finds the button inside it. Every close moves focus back to the button.
 */
export const useMenuButton = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [initialFocus, setInitialFocus] = useState('first');
    const anchorRef = useRef(null);

    // The ⋮ button inside the anchor, or null before it renders.
    const getButton = useCallback(() => (anchorRef.current && anchorRef.current.querySelector('button')) || null, []);

    const open = useCallback((focusOn = 'first') => {
        setInitialFocus(focusOn);
        setIsOpen(true);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
        const button = getButton();
        if (button) {
            button.focus();
        }
    }, [getButton]);

    const toggle = useCallback(() => {
        if (isOpen) {
            close();
        } else {
            open('first');
        }
    }, [isOpen, open, close]);

    // ArrowDown and ArrowUp on the button open the menu on its first or last item.
    // Space toggles the menu on keydown, like Enter, instead of the native click on keyup.
    const onButtonKeyDown = useCallback(event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            open(event.key === 'ArrowDown' ? 'first' : 'last');
        } else if (event.key === ' ') {
            event.preventDefault();
            if (!event.repeat) {
                toggle();
            }
        }
    }, [open, toggle]);

    // A menu item acts on the Space keydown and gives focus back to this button, so the keyup lands here;
    // Firefox would then click the button and open the menu again.
    const onButtonKeyUp = useCallback(event => {
        if (event.key === ' ') {
            event.preventDefault();
        }
    }, []);

    return {isOpen, initialFocus, anchorRef, getButton, close, toggle, onButtonKeyDown, onButtonKeyUp};
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
