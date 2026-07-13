import {
    getComparator,
    resolveAllDependentModules,
    buildModuleFilter,
    ariaSortFor,
    JAHIA_MODULE_TYPES
} from './moduleUtils';

/**
 * S35-S40 — client-side filter / sort logic. These exercise the pure predicates extracted from
 * ModuleManagementCommunityApp.jsx into moduleUtils.js, so they run under jest with only babel
 * (no jsdom / React Testing Library needed).
 */

const filterFor = (overrides = {}) => buildModuleFilter({
    updatesOnly: false,
    updates: [],
    dependentUpdates: {},
    typeFilter: '',
    bundleTypes: {},
    debouncedFilter: '',
    ...overrides
});

const apply = (rows, predicate) => rows.filter(predicate).map(r => r.name);

describe('buildModuleFilter — name filter (S35)', () => {
    const rows = [
        {name: 'org.jahia.dashboard'},
        {name: 'org.foo.DASHBOARD-x'},
        {name: 'org.bar.news'}
    ];

    test('matches symbolic name as a case-insensitive substring', () => {
        const result = apply(rows, filterFor({debouncedFilter: 'dashboard'}));
        expect(result).toEqual(['org.jahia.dashboard', 'org.foo.DASHBOARD-x']);
    });

    test('empty term returns all rows', () => {
        expect(apply(rows, filterFor({debouncedFilter: '   '}))).toHaveLength(3);
    });
});

describe('buildModuleFilter — type filter (S36)', () => {
    const rows = [{name: 'a'}, {name: 'b'}, {name: 'c'}, {name: 'd'}];
    const bundleTypes = {a: 'module', b: 'system', c: 'templatesSet', d: 'bundle'};

    test('default "jahia" shows module/system/templatesSet and hides plain bundles', () => {
        expect(apply(rows, filterFor({typeFilter: 'jahia', bundleTypes})))
            .toEqual(['a', 'b', 'c']);
    });

    test('empty type filter ("All") shows every row', () => {
        expect(apply(rows, filterFor({typeFilter: '', bundleTypes}))).toHaveLength(4);
    });

    test('individual type "bundle" shows only bundles', () => {
        expect(apply(rows, filterFor({typeFilter: 'bundle', bundleTypes}))).toEqual(['d']);
    });

    test('individual type "module" shows only modules', () => {
        expect(apply(rows, filterFor({typeFilter: 'module', bundleTypes}))).toEqual(['a']);
    });

    test('JAHIA_MODULE_TYPES is the documented set', () => {
        expect(JAHIA_MODULE_TYPES).toEqual(['module', 'system', 'templatesSet']);
    });
});

describe('buildModuleFilter — updates-only (S38)', () => {
    const rows = [{name: 'A'}, {name: 'B'}, {name: 'C'}];
    const updates = [{name: 'A'}];             // A has a direct update
    const dependentUpdates = {B: ['dep']};     // B has a dependent-only update

    test('hides modules with neither a direct nor a dependent update', () => {
        const result = apply(rows, filterFor({updatesOnly: true, updates, dependentUpdates}));
        expect(result).toEqual(['A', 'B']); // C hidden
    });

    test('toggle off shows all', () => {
        const result = apply(rows, filterFor({updatesOnly: false, updates, dependentUpdates}));
        expect(result).toHaveLength(3);
    });
});

describe('buildModuleFilter — combined AND (S39)', () => {
    const rows = [
        {name: 'org.x.news'},   // matches name+type+update
        {name: 'org.y.news'},   // right name, wrong type
        {name: 'org.x.blog'}    // right type+update, wrong name
    ];
    const bundleTypes = {'org.x.news': 'module', 'org.y.news': 'bundle', 'org.x.blog': 'module'};
    const updates = [{name: 'org.x.news'}, {name: 'org.x.blog'}];

    test('only rows matching name AND type AND updates-only survive', () => {
        const result = apply(rows, filterFor({
            debouncedFilter: 'news',
            typeFilter: 'module',
            updatesOnly: true,
            updates,
            bundleTypes
        }));
        expect(result).toEqual(['org.x.news']);
    });
});

describe('ariaSortFor + getComparator (S40)', () => {
    test('aria-sort reflects the active column and direction', () => {
        expect(ariaSortFor('name', 'name', 'asc')).toBe('ascending');
        expect(ariaSortFor('name', 'name', 'desc')).toBe('descending');
        expect(ariaSortFor('name', 'version', 'asc')).toBe('none');
    });

    test('getComparator sorts ascending and descending by the given key', () => {
        const rows = [{name: 'c'}, {name: 'a'}, {name: 'b'}];
        const asc = [...rows].sort(getComparator('asc', 'name')).map(r => r.name);
        const desc = [...rows].sort(getComparator('desc', 'name')).map(r => r.name);
        expect(asc).toEqual(['a', 'b', 'c']);
        expect(desc).toEqual(['c', 'b', 'a']);
    });
});

describe('resolveAllDependentModules (supports S38 dependent-update expansion)', () => {
    test('includes reverse dependents that also have updates available', () => {
        // b depends on a; both have updates → updating a must also pull in b.
        const dependencyStructure = {b: ['a'], a: []};
        const updatesAvailable = [{name: 'a'}, {name: 'b'}];
        const result = resolveAllDependentModules('a', dependencyStructure, updatesAvailable);
        expect(result).toEqual(expect.arrayContaining(['a', 'b']));
    });

    test('excludes dependents without an available update', () => {
        const dependencyStructure = {b: ['a'], a: []};
        const updatesAvailable = [{name: 'a'}]; // b has no update
        const result = resolveAllDependentModules('a', dependencyStructure, updatesAvailable);
        expect(result).toEqual(['a']);
    });
});
