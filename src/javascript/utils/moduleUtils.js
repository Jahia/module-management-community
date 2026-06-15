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

