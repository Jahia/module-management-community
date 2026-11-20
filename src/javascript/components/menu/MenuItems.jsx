import React, {useId} from 'react';
import * as PropTypes from 'prop-types';
import {CheckboxChecked, CheckboxUnchecked, MenuItem} from '@jahia/moonstone';
import styles from './menus.scss';

// The moonstone MenuItem renders a plain list item, so these items carry the menu role and answer Enter and Space.
// They act on keydown, where preventDefault stops Space from scrolling the page.
const activateOnKey = onActivate => event => {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
    }
};

/**
 * A menu item that runs one action.
 * description is shown under the label, or kept for assistive technology only with isDescriptionHidden;
 * either way it is the item's description, not part of its name.
 */
export const ActionMenuItem = ({label, description, isDescriptionHidden, isDisabled, onClick, ...props}) => {
    const id = useId();
    const labelId = `${id}-label`;
    const descriptionId = `${id}-description`;
    return (
        <MenuItem
            role="menuitem"
            aria-disabled={isDisabled || undefined}
            aria-labelledby={labelId}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={isDisabled ? -1 : 0}
            label={(
                <>
                    <span id={labelId}>{label}</span>
                    {description && isDescriptionHidden && <span id={descriptionId} className={styles.srOnly}>{description}</span>}
                </>
            )}
            description={description && !isDescriptionHidden ? <span id={descriptionId}>{description}</span> : undefined}
            className={description && !isDescriptionHidden ? styles.withDescription : undefined}
            isDisabled={isDisabled}
            onClick={isDisabled ? undefined : onClick}
            onKeyDown={isDisabled ? undefined : activateOnKey(onClick)}
            {...props}
        />
    );
};

ActionMenuItem.propTypes = {
    label: PropTypes.string.isRequired,
    description: PropTypes.string,
    isDescriptionHidden: PropTypes.bool,
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
        onKeyDown={activateOnKey(onToggle)}
        {...props}
    />
);

CheckMenuItem.propTypes = {
    label: PropTypes.string.isRequired,
    isChecked: PropTypes.bool.isRequired,
    onToggle: PropTypes.func.isRequired
};
