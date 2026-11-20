// Focus helpers for the dialogs. The Moonstone Button forwards no ref, so a footer
// action is found by its data-focus attribute inside the ref'd ModalFooter.

// The frame delay lets React commit the new state and the Moonstone focus trap
// settle before the focus moves; an immediate focus() can hit a node that is
// still disabled or about to unmount.
export const focusLater = getElement => {
    window.requestAnimationFrame(() => {
        const element = getElement();
        if (element && typeof element.focus === 'function') {
            element.focus();
        }
    });
};

export const focusFooterAction = (footerRef, name) => {
    focusLater(() => Array.from(footerRef.current?.querySelectorAll('[data-focus]') || [])
        .find(element => element.dataset.focus === name));
};
