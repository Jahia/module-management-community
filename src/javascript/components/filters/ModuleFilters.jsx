import React, {useState} from 'react';
import * as PropTypes from 'prop-types';
import {Input} from '@jahia/moonstone';
import {useTranslation} from 'react-i18next';
import {FilterChip} from './FilterChip';
import {CheckMenuItem} from '../menu/MenuItems';
import {BUNDLE_TYPES} from '../../utils/moduleFilters';
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

/** Every filter is always in the row. The Updates filter shows only when an update is available. */
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
            {hasUpdates && <UpdatesFilter {...chip('updates')} filters={filters} onChange={onChange}/>}
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
