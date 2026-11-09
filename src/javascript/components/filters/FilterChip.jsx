import React, {useEffect, useRef} from 'react';
import * as PropTypes from 'prop-types';
import {Button, ButtonGroup, ChevronDown, Close, Menu, MenuItem} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import {useEscapeKey} from '../../hooks/useEscapeKey';
import styles from './Filters.scss';

/**
 * One filter of the filter row, as Site history draws it: a dashed chip while the filter is empty,
 * and a filled chip with a clear button once it holds a value. A click opens the editor below the chip.
 */
export const FilterChip = ({id, name, value, isOpen, onOpen, onClose, onClear, children}) => {
    const {t} = useTranslation('module-management-community');
    const anchorRef = useRef(null);
    const editorRef = useRef(null);
    const clearLabel = t('label.filters.clearOne', {name, interpolation: {escapeValue: false}});

    useEffect(() => {
        if (isOpen) {
            editorRef.current?.querySelector('input, [tabindex="0"]')?.focus({preventScroll: true});
        }
    }, [isOpen]);

    // Moonstone Button takes no ref, and a new value swaps the Button for a ButtonGroup, so the focus moves after the render.
    const focusChipAfterRender = () => setTimeout(() => anchorRef.current?.querySelector('button')?.focus());

    const close = () => {
        onClose();
        focusChipAfterRender();
    };

    useEscapeKey(isOpen, close);

    const clear = () => {
        onClear();
        focusChipAfterRender();
    };

    const editButton = (
        <Button
            variant="outlined"
            className={value ? `${styles.chipValue} ${styles.chipFilled}` : styles.chipEmpty}
            label={value ? <><strong>{t('label.filters.chipName', {name, interpolation: {escapeValue: false}})}</strong> {value}</> : name}
            iconEnd={<ChevronDown/>}
            title={value ? `${name}: ${value}` : undefined}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            data-testid="filter-chip-edit"
            onClick={() => (isOpen ? close() : onOpen())}
        />
    );

    return (
        <>
            <span ref={anchorRef} className={styles.chip} data-testid="filter-chip" data-filter={id}>
                {value ? (
                    <ButtonGroup variant="outlined" color="accent">
                        {editButton}
                        <Button
                            className={`${styles.chipFilled} ${styles.chipClear}`}
                            icon={<Close/>}
                            aria-label={clearLabel}
                            title={clearLabel}
                            data-testid="filter-chip-clear"
                            onClick={clear}
                        />
                    </ButtonGroup>
                ) : editButton}
            </span>
            {isOpen && (
                <Menu isDisplayed
                      hasSearch={false}
                      anchorEl={anchorRef}
                      data-testid="filter-editor"
                      data-filter={id}
                      onClose={close}
                >
                    <div ref={editorRef} role="dialog" aria-label={name}>
                        <MenuItem variant="title" label={name}/>
                        {children}
                        <div className={styles.menuFooter}>
                            <Button variant="ghost"
                                    label={t('label.close')}
                                    data-testid="filter-editor-close"
                                    onClick={close}/>
                        </div>
                    </div>
                </Menu>
            )}
        </>
    );
};

FilterChip.propTypes = {
    id: PropTypes.string.isRequired,
    name: PropTypes.string.isRequired,
    // An empty value gives a dashed chip with no clear button.
    value: PropTypes.string.isRequired,
    isOpen: PropTypes.bool.isRequired,
    onOpen: PropTypes.func.isRequired,
    onClose: PropTypes.func.isRequired,
    onClear: PropTypes.func.isRequired,
    children: PropTypes.node
};
