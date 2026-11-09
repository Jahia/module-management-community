/** Module types that are "Jahia modules" as opposed to plain OSGi bundles. */
export const JAHIA_MODULE_TYPES = ['module', 'system', 'templatesSet'];

export const BUNDLE_TYPES = [...JAHIA_MODULE_TYPES, 'bundle'];

export const DEFAULT_FILTERS = {name: '', types: JAHIA_MODULE_TYPES, states: [], updatesOnly: false};

// The installedModules field gives the state as the int of Bundle.getState(), and the bundle field gives its name.
const OSGI_STATE_NAMES = {1: 'UNINSTALLED', 2: 'INSTALLED', 4: 'RESOLVED', 8: 'STARTING', 16: 'STOPPING', 32: 'ACTIVE'};

export const toStateName = state => OSGI_STATE_NAMES[state] || state;

const sameValues = (a, b) => a.length === b.length && a.every(value => b.includes(value));

export const isDefaultFilters = filters =>
    filters.name === DEFAULT_FILTERS.name &&
    sameValues(filters.types, DEFAULT_FILTERS.types) &&
    filters.states.length === 0 &&
    !filters.updatesOnly;

/**
 * Predicate factory for the installed-modules table. An empty list of types or states keeps every module.
 * A module with an update, or with a dependency that has one, passes the updates filter.
 */
export const buildModuleFilter = ({filters, hasUpdate}) => {
    const needle = filters.name.trim().toLowerCase();
    return module => (needle === '' || module.name.toLowerCase().includes(needle)) &&
        (filters.types.length === 0 || filters.types.includes(module.type)) &&
        (filters.states.length === 0 || filters.states.includes(module.state)) &&
        (!filters.updatesOnly || hasUpdate(module.name));
};
