import React from 'react';
import * as PropTypes from 'prop-types';
import {CheckboxChecked, CheckboxUnchecked, MenuItem} from '@jahia/moonstone';

// The moonstone MenuItem renders a plain list item, so these items carry the menu role and answer Enter and Space.
const activateOnKey = onActivate => event => {
    if (event.key === 'Enter' || event.key === ' ') {
        onActivate();
    }
};

/** A menu item that runs one action. */
export const ActionMenuItem = ({label, isDisabled, onClick, ...props}) => (
    <MenuItem
        role="menuitem"
        aria-disabled={isDisabled || undefined}
        tabIndex={isDisabled ? -1 : 0}
        label={label}
        isDisabled={isDisabled}
        onClick={isDisabled ? undefined : onClick}
        onKeyUp={isDisabled ? undefined : activateOnKey(onClick)}
        {...props}
    />
);

ActionMenuItem.propTypes = {
    label: PropTypes.string.isRequired,
    isDisabled: PropTypes.bool,
    onClick: PropTypes.func.isRequired
};

/** A menu item that toggles one value. */
export const CheckMenuItem = ({label, isChecked, onToggle, ...props}) => (
    <MenuItem
        role="menuitemcheckbox"
        aria-checked={isChecked}
        tabIndex={0}
        label={label}
        iconStart={isChecked ? <CheckboxChecked color="blue"/> : <CheckboxUnchecked/>}
        onClick={onToggle}
        onKeyUp={activateOnKey(onToggle)}
        {...props}
    />
);

CheckMenuItem.propTypes = {
    label: PropTypes.string.isRequired,
    isChecked: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired
};
