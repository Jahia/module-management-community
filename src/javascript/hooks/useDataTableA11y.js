import {useEffect} from 'react';

const PAGER_BUTTONS = {
    'pagination-button-first-page': 'first',
    'pagination-button-previous-page': 'previous',
    'pagination-button-next-page': 'next',
    'pagination-button-last-page': 'last'
};

/**
 * Patches what the Moonstone DataTable renders and takes no prop for, inside the scrolling container of the table:
 * the pager buttons get a name, the rows-per-page dropdown is named by its visible caption, the header row loses
 * the tab stop that TableRow always sets, and the scroll padding matches the sticky head and pager, so a focused
 * control never sits under them.
 *
 * React leaves an attribute it does not own in place, so the patch only has to run again after each render.
 */
export const useDataTableA11y = (containerRef, {labels, rowsPerPageId, pagerClassName}) => {
    useEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        container.querySelectorAll('thead tr[tabindex]').forEach(row => row.removeAttribute('tabindex'));

        Object.entries(PAGER_BUTTONS).forEach(([testId, key]) => {
            const button = container.querySelector(`[data-testid="${testId}"]`);
            if (button && labels[key]) {
                button.setAttribute('aria-label', labels[key]);
            }
        });

        const dropdown = container.querySelector('[data-testid="pagination-dropdown-items-per-page"]');
        const listbox = dropdown?.querySelector('[role="listbox"]');
        const caption = dropdown?.previousElementSibling;
        if (listbox && caption) {
            caption.id = `${rowsPerPageId}-label`;
            listbox.id = `${rowsPerPageId}-value`;
            // The listbox keeps its own aria-label, the current value, as the second part of its name.
            listbox.setAttribute('aria-labelledby', `${caption.id} ${listbox.id}`);
        }

        const head = container.querySelector('thead');
        const pager = container.querySelector(`.${pagerClassName}`);
        container.style.scrollPaddingTop = head ? `${head.offsetHeight}px` : '';
        container.style.scrollPaddingBottom = pager ? `${pager.offsetHeight}px` : '';
    });
};
