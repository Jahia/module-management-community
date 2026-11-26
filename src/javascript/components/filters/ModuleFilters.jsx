import React, {useState} from 'react';
import * as PropTypes from 'prop-types';
import {Input} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import {FilterCheckbox, FilterChip} from './FilterChip';
import {BUNDLE_TYPES} from '../../utils/moduleFilters';
import {stateLabel, typeLabel} from '../../utils/moduleStates';
import styles from './Filters.scss';

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
                   aria-label={t('label.input.filterBySymbolicName')}
                   data-testid="filter-name"
                   onChange={event => onChange('name', event.target.value)}
                   onClear={() => onChange('name', '')}/>
        </div>
    );
};

/**
 * Every type checked means no type filter: the chip is empty, and its clear button checks every type.
 * No type checked keeps no module, and the chip says so.
 */
const typeFilterValue = (t, types) => {
    if (types.length === 0) {
        return t('label.filters.typesNone');
    }

    return BUNDLE_TYPES.every(type => types.includes(type)) ?
        '' :
        BUNDLE_TYPES.filter(type => types.includes(type)).map(type => typeLabel(t, type)).join(', ');
};

const TypeFilter = ({filters, onChange, ...chip}) => {
    const {t} = useTranslation('module-management-community');
    return (
        <FilterChip {...chip}
                    id="type"
                    name={t('label.filters.type')}
                    value={typeFilterValue(t, filters.types)}
                    onClear={() => onChange('types', BUNDLE_TYPES)}
        >
            {BUNDLE_TYPES.map(type => (
                <FilterCheckbox key={type}
                                label={typeLabel(t, type)}
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
    // A selected state that no module has any more stays listed, so the user sees it and can uncheck it.
    const choices = [...states, ...filters.states.filter(state => !states.includes(state))];
    const value = choices.filter(state => filters.states.includes(state)).map(state => stateLabel(t, state)).join(', ');
    return (
        <FilterChip {...chip} id="state" name={t('label.filters.state')} value={value} onClear={() => onChange('states', [])}>
            {choices.map(state => (
                <FilterCheckbox key={state}
                                label={stateLabel(t, state)}
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
            <FilterCheckbox label={t('label.input.updatesOnly')}
                            isChecked={filters.updatesOnly}
                            data-testid="filter-updates"
                            onToggle={() => onChange('updatesOnly', !filters.updatesOnly)}/>
        </FilterChip>
    );
};

/**
 * Every filter is always in the row. The Updates filter shows when an update is available,
 * and stays while it is active, so a filter that hides every row always has its chip.
 */
export const ModuleFilters = ({filters, states, hasUpdates, onChange}) => {
    const [openFilter, setOpenFilter] = useState(null);

    const chip = id => ({
        isOpen: openFilter === id,
        onOpen: () => setOpenFilter(id),
        onClose: () => setOpenFilter(null)
    });

    return (
        <div className={styles.filters} data-testid="module-filters">
            <NameFilter filters={filters} onChange={onChange}/>
            <TypeFilter {...chip('type')} filters={filters} onChange={onChange}/>
            <StateFilter {...chip('state')} filters={filters} states={states} onChange={onChange}/>
            {(hasUpdates || filters.updatesOnly) && <UpdatesFilter {...chip('updates')} filters={filters} onChange={onChange}/>}
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

ModuleFilters.propTypes = {
    filters: filtersShape.isRequired,
    states: PropTypes.arrayOf(PropTypes.string).isRequired,
    hasUpdates: PropTypes.bool.isRequired,
    onChange: PropTypes.func.isRequired
};
