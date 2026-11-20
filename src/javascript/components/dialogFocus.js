// Focus helpers for the dialogs. The Moonstone Button forwards no ref, so a footer
// action is found by its data-focus attribute inside the ref'd ModalFooter.

// The frame delay lets React commit the new state and the Moonstone focus trap
// settle before the focus moves; an immediate focus() can hit a node that is
// still disabled or about to unmount.
// With getReveal, the element it returns, such as a label and its content, is scrolled into view first, and the
// focus itself does not scroll: a focus alone scrolls the target to the edge and can hide the label above it.
export const focusLater = (getElement, getReveal) => {
    window.requestAnimationFrame(() => {
        const element = getElement();
        if (element && typeof element.focus === 'function') {
            const reveal = getReveal && getReveal();
            if (reveal) {
                reveal.scrollIntoView({block: 'nearest'});
                element.focus({preventScroll: true});
            } else {
                element.focus();
            }
        }
    });
};

export const focusFooterAction = (footerRef, name) => {
    focusLater(() => Array.from(footerRef.current?.querySelectorAll('[data-focus]') || [])
        .find(element => element.dataset.focus === name));
};
