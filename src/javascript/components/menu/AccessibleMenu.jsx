import React, {useEffect, useId} from 'react';
import * as PropTypes from 'prop-types';
import {Menu, MenuItem} from '@jahia/moonstone';
import {useEscapeKey} from '../../hooks/useEscapeKey';

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

const getItems = menuId => {
    const menu = document.getElementById(menuId);
    return menu ? Array.from(menu.querySelectorAll(ITEM_SELECTOR)) : [];
};

const focusItem = (items, index) => {
    if (items.length > 0) {
        items[(index + items.length) % items.length].focus();
    }
};

/**
 * The moonstone Menu with the menu pattern of WAI-ARIA: role="menu", focus on the first item on open,
 * ArrowUp, ArrowDown, Home and End between the items, and Escape or Tab to close.
 * The moonstone Menu renders <menu role="list"> and forwards its other props to that element,
 * so the role and the key handler are passed through it. Its items must have tabIndex -1:
 * the moonstone MenuItem moves focus itself on keyup between the items with tabIndex 0.
 * The test id goes on a wrapper the module owns, as the Menu props do not promise to forward it.
 */
export const AccessibleMenu = ({isOpen, initialFocus = 'first', anchorRef, label, onClose, children, 'data-testid': testId, ...props}) => {
    const menuId = useId();
    useEscapeKey(isOpen, onClose);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        // The menu computes its position after its first render; focus waits for that frame.
        const frame = requestAnimationFrame(() => {
            const items = getItems(menuId);
            focusItem(items, initialFocus === 'last' ? items.length - 1 : 0);
        });
        return () => cancelAnimationFrame(frame);
    }, [isOpen, initialFocus, menuId]);

    if (!isOpen) {
        return null;
    }

    const handleKeyDown = event => {
        const items = getItems(menuId);
        const index = items.indexOf(document.activeElement);
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                focusItem(items, index + 1);
                break;
            case 'ArrowUp':
                event.preventDefault();
                focusItem(items, index < 0 ? -1 : index - 1);
                break;
            case 'Home':
                event.preventDefault();
                focusItem(items, 0);
                break;
            case 'End':
                event.preventDefault();
                focusItem(items, items.length - 1);
                break;
            case 'Escape':
            case 'Tab':
                event.preventDefault();
                event.stopPropagation();
                onClose();
                break;
            case ' ':
                // Space never scrolls the page while the menu is open.
                event.preventDefault();
                break;
            default:
                break;
        }
    };

    return (
        <Menu isDisplayed
              hasSearch={false}
              anchorEl={anchorRef}
              role="menu"
              id={menuId}
              aria-label={label}
              onKeyDown={handleKeyDown}
              onClose={onClose}
              {...props}
        >
            <div data-testid={testId}>
                {children}
            </div>
        </Menu>
    );
};

AccessibleMenu.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    initialFocus: PropTypes.oneOf(['first', 'last']),
    anchorRef: PropTypes.object.isRequired,
    label: PropTypes.string.isRequired,
    onClose: PropTypes.func.isRequired,
    children: PropTypes.node.isRequired,
    'data-testid': PropTypes.string
};

/** A group of menu items under a visible title. The title is hidden from the tree and names the group. */
export const MenuGroup = ({title, children}) => {
    const titleId = useId();
    return (
        <div role="group" aria-labelledby={titleId}>
            <MenuItem variant="title" id={titleId} label={title} aria-hidden="true"/>
            {children}
        </div>
    );
};

MenuGroup.propTypes = {
    title: PropTypes.string.isRequired,
    children: PropTypes.node.isRequired
};
