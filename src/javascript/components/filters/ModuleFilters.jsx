import React, {useCallback, useRef, useState} from 'react';
import * as PropTypes from 'prop-types';
import {Add, Button, Input, Menu} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import {FilterChip} from './FilterChip';
import {ActionMenuItem, CheckMenuItem} from '../menu/MenuItems';
import {BUNDLE_TYPES} from '../../utils/moduleFilters';
import styles from './Filters.scss';
import {useEscapeKey} from '../../hooks/useEscapeKey';

/** The filters that Add filter puts in the row. Name and Type are always in the row. */
const ADDABLE_FILTERS = ['state', 'updates'];

const toggleValue = (values, value) => (values.includes(value) ? values.filter(v => v !== value) : [...values, value]);

/** The name filter stays open in the filter row, and the table follows each key the user types. */
const NameFilter = ({filters, onChange}) => {
    const {t} = useTranslation('module-management-community');
    return (
        <div className={styles.nameFilter}>
            <Input variant="search"
                   size="big"
                   value={filters.name}
                   placeholder={t('label.input.filterBySymbolicName')}
                   aria-label={t('label.filters.name')}
                   data-testid="filter-name"
                   onChange={event => onChange('name', event.target.value)}
                   onClear={() => onChange('name', '')}/>
        </div>
    );
};

const TypeFilter = ({filters, onChange, ...chip}) => {
    const {t} = useTranslation('module-management-community');
    const value = BUNDLE_TYPES.filter(type => filters.types.includes(type)).join(', ');
    return (
        <FilterChip {...chip} id="type" name={t('label.filters.type')} value={value} onClear={() => onChange('types', [])}>
            {BUNDLE_TYPES.map(type => (
                <CheckMenuItem key={type}
                               label={type}
                               isChecked={filters.types.includes(type)}
                               data-testid="filter-type"
                               data-type={type}
                               onToggle={() => onChange('types', toggleValue(filters.types, type))}/>
            ))}
        </FilterChip>
    );
};

const StateFilter = ({filters, states, onChange, ...chip}) => {
    const {t} = useTranslation('module-management-community');
    const value = states.filter(state => filters.states.includes(state)).join(', ');
    return (
        <FilterChip {...chip} id="state" name={t('label.filters.state')} value={value} onClear={() => onChange('states', [])}>
            {states.map(state => (
                <CheckMenuItem key={state}
                               label={state}
                               isChecked={filters.states.includes(state)}
                               data-testid="filter-state"
                               data-state={state}
                               onToggle={() => onChange('states', toggleValue(filters.states, state))}/>
            ))}
        </FilterChip>
    );
};

const UpdatesFilter = ({filters, onChange, ...chip}) => {
    const {t} = useTranslation('module-management-community');
    return (
        <FilterChip {...chip}
                    id="updates"
                    name={t('label.filters.updates')}
                    value={filters.updatesOnly ? t('label.filters.updatesValue') : ''}
                    onClear={() => onChange('updatesOnly', false)}
        >
            <CheckMenuItem label={t('label.input.updatesOnly')}
                           isChecked={filters.updatesOnly}
                           data-testid="filter-updates"
                           onToggle={() => onChange('updatesOnly', !filters.updatesOnly)}/>
        </FilterChip>
    );
};

const AddFilter = ({ids, onAdd}) => {
    const {t} = useTranslation('module-management-community');
    const [isOpen, setIsOpen] = useState(false);
    const closeMenu = useCallback(() => setIsOpen(false), []);
    useEscapeKey(isOpen, closeMenu);
    const anchorRef = useRef(null);

    const add = id => {
        setIsOpen(false);
        onAdd(id);
    };

    return (
        <>
            <span ref={anchorRef} className={styles.chip}>
                <Button variant="ghost"
                        className={styles.addFilter}
                        icon={<Add/>}
                        label={t('label.filters.add')}
                        isDisabled={ids.length === 0}
                        aria-haspopup="menu"
                        aria-expanded={isOpen}
                        data-testid="filter-add"
                        onClick={() => setIsOpen(!isOpen)}/>
            </span>
            {isOpen && (
                <Menu isDisplayed
                      hasSearch={false}
                      anchorEl={anchorRef}
                      data-testid="filter-add-menu"
                      onClose={closeMenu}
                >
                    {ids.map(id => (
                        <ActionMenuItem key={id}
                                        label={t(`label.filters.${id}`)}
                                        data-testid="filter-add-item"
                                        data-filter={id}
                                        onClick={() => add(id)}/>
                    ))}
                </Menu>
            )}
        </>
    );
};

export const ModuleFilters = ({filters, states, hasUpdates, onChange}) => {
    const [openFilter, setOpenFilter] = useState(null);
    // The State and Updates chips keep the order in which the user added them.
    const [addOrder, setAddOrder] = useState([]);

    const chip = id => ({
        isOpen: openFilter === id,
        onOpen: () => setOpenFilter(id),
        onClose: () => setOpenFilter(null)
    });

    const holdsValue = id => (id === 'state' ? filters.states.length > 0 : filters.updatesOnly);
    const addable = ADDABLE_FILTERS.filter(id => id !== 'updates' || hasUpdates);
    // An added filter stays in the row while it holds a value or while its editor is open.
    const added = [...addOrder, ...addable.filter(id => !addOrder.includes(id))]
        .filter(id => addable.includes(id) && (openFilter === id || holdsValue(id)));

    const add = id => {
        setAddOrder(order => [...order.filter(other => other !== id), id]);
        setOpenFilter(id);
    };

    return (
        <div className={styles.filters} data-testid="module-filters">
            <NameFilter filters={filters} onChange={onChange}/>
            <TypeFilter {...chip('type')} filters={filters} onChange={onChange}/>
            {added.map(id => (id === 'state' ?
                <StateFilter key={id} {...chip(id)} filters={filters} states={states} onChange={onChange}/> :
                <UpdatesFilter key={id} {...chip(id)} filters={filters} onChange={onChange}/>
            ))}
            <AddFilter ids={addable.filter(id => !added.includes(id))} onAdd={add}/>
        </div>
    );
};

const filtersShape = PropTypes.shape({
    name: PropTypes.string.isRequired,
    types: PropTypes.arrayOf(PropTypes.string).isRequired,
    states: PropTypes.arrayOf(PropTypes.string).isRequired,
    updatesOnly: PropTypes.bool.isRequired
});

const chipPropTypes = {
    filters: filtersShape.isRequired,
    onChange: PropTypes.func.isRequired
};

NameFilter.propTypes = chipPropTypes;
TypeFilter.propTypes = chipPropTypes;
UpdatesFilter.propTypes = chipPropTypes;
StateFilter.propTypes = {...chipPropTypes, states: PropTypes.arrayOf(PropTypes.string).isRequired};

AddFilter.propTypes = {
    ids: PropTypes.arrayOf(PropTypes.string).isRequired,
    onAdd: PropTypes.func.isRequired
};

ModuleFilters.propTypes = {
    filters: filtersShape.isRequired,
    states: PropTypes.arrayOf(PropTypes.string).isRequired,
    hasUpdates: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired
};
