/**
 * Utility functions for module sorting, comparison and dependency resolution.
 */

const descendingComparator = (a, b, orderBy) => {
    if (!a[orderBy] && !b[orderBy]) {
        return 0;
    }

    if (!b[orderBy] || b[orderBy] < a[orderBy]) {
        return -1;
    }

    if (!a[orderBy] || b[orderBy] > a[orderBy]) {
        return 1;
    }

    return 0;
};

export const getComparator = (order, orderBy) => {
    return order === 'desc' ?
        (a, b) => descendingComparator(a, b, orderBy) :
        (a, b) => -descendingComparator(a, b, orderBy);
};

/** Module types that are "Jahia modules" as opposed to plain OSGi bundles. */
export const JAHIA_MODULE_TYPES = ['module', 'system', 'templatesSet'];

/** Aria-sort value for a column header given the active sort column/direction. */
export const ariaSortFor = (property, orderBy, order) => {
    if (orderBy !== property) {
        return 'none';
    }

    return order === 'asc' ? 'ascending' : 'descending';
};

/**
 * Predicate factory for the installed-modules table filter. Extracted from the
 * component to keep the render function's cognitive complexity within budget and
 * to make the name/type/updates-only filtering unit-testable in isolation.
 *
 * Applies name (case-insensitive substring), type (jahia / individual / all) and
 * updates-only (direct or dependent update) filters together as a logical AND.
 */
export const buildModuleFilter = ({updatesOnly, updates, dependentUpdates, typeFilter, bundleTypes, debouncedFilter}) => module => {
    if (updatesOnly &&
        !updates.some(u => u.name === module.name) &&
        !dependentUpdates[module.name]?.length) {
        return false;
    }

    if (typeFilter === 'jahia') {
        const knownType = bundleTypes[module.name];
        if (knownType && !JAHIA_MODULE_TYPES.includes(knownType)) {
            return false;
        }
    } else if (typeFilter) {
        const knownType = bundleTypes[module.name];
        if (knownType && knownType !== typeFilter) {
            return false;
        }
    }

    const needle = debouncedFilter.trim().toLowerCase();
    return needle === '' || module.name.toLowerCase().includes(needle);
};

/**
 * Recursively resolve all modules that need to be updated together with a target module.
 * Walks both forward dependencies (modules this one depends on) and reverse dependencies
 * (modules that depend on this one) to build the full set.
 */
export const resolveAllDependentModules = (targetModule, dependencyStructure, updatesAvailable) => {
    const reverseDependencyMap = {};
    Object.entries(dependencyStructure).forEach(([module, dependencies]) => {
        dependencies.forEach(dep => {
            if (!reverseDependencyMap[dep]) {
                reverseDependencyMap[dep] = new Set();
            }

            reverseDependencyMap[dep].add(module);
        });
    });

    const result = new Set([targetModule]);

    const findDependentModules = module => {
        const dependentModules = reverseDependencyMap[module] || new Set();
        dependentModules.forEach(dependentModule => {
            if (!result.has(dependentModule) && updatesAvailable.some(u => u.name === dependentModule)) {
                result.add(dependentModule);
            }

            findDependentModules(dependentModule);
        });
    };

    if (dependencyStructure[targetModule]?.length > 0) {
        dependencyStructure[targetModule].forEach(dep => {
            if (!result.has(dep) && updatesAvailable.some(u => u.name === dep)) {
                result.add(dep);
            }
        });
    }

    findDependentModules(targetModule);
    return Array.from(result);
};

