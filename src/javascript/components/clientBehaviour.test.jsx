/**
 * @jest-environment jsdom
 *
 * S41 / S42 — component & hook behaviour specs.
 *
 * These require `@testing-library/react` + `jest-environment-jsdom` (added to devDependencies
 * in Stage 6). They exercise the two client-side behaviours that are genuinely unit-isolatable:
 *
 *   - S42: the `useModulePreferences` hook — localStorage persistence + restore on re-mount.
 *   - S41: the `ModuleTablePagination` footer — the page-size <select> is offered correctly
 *          and, per the component contract, changing the page size resets the page to 1
 *          (this is also the concrete mechanism behind "filter change resets pagination", S37 —
 *          see the note at the bottom of this file).
 *
 * @jahia/moonstone and react-i18next are mocked to plain DOM so the render stays light and
 * deterministic (no design-system runtime, no i18n backend) — these specs assert our behaviour,
 * not the third-party widgets.
 */
import React from 'react';
import {render, screen, fireEvent, renderHook, act} from '@testing-library/react';
import {useModulePreferences} from '../hooks/useModulePreferences';
import {ModuleTablePagination} from './ModuleTablePagination';

// --- Lightweight mocks: keep the render free of the design-system / i18n runtime -----------
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        // Echo interpolation so the "Showing from to total" label is assertable.
        t: (key, opts) => (opts && typeof opts === 'object' ?
            `${key} ${JSON.stringify(opts)}` :
            (typeof opts === 'string' ? opts : key))
    })
}));

jest.mock('@jahia/moonstone', () => ({
    // eslint-disable-next-line react/prop-types
    Button: ({label, onClick, isDisabled}) => (
        <button type="button" disabled={isDisabled} onClick={onClick}>{label}</button>
    ),
    // eslint-disable-next-line react/prop-types
    Typography: ({children}) => <span>{children}</span>
}));

// -------------------------------------------------------------------------------------------
// S42 — useModulePreferences persists and restores preferences
// -------------------------------------------------------------------------------------------
describe('useModulePreferences persists and restores preferences (S42)', () => {
    beforeEach(() => localStorage.clear());

    test('defaults are returned when nothing is stored', () => {
        const {result} = renderHook(() => useModulePreferences());
        const [prefs] = result.current;
        expect(prefs.dryRun).toBe(true);
        expect(prefs.updatesOnly).toBe(false);
        expect(prefs.autoRefresh).toBe(true);
    });

    test('a preference set through the hook is written to localStorage', () => {
        const {result} = renderHook(() => useModulePreferences());
        const [prefs, setPreferences] = result.current;

        act(() => setPreferences({...prefs, updatesOnly: true}));

        const stored = JSON.parse(localStorage.getItem('moduleManagement.updatePreferences'));
        expect(stored.updatesOnly).toBe(true);
        expect(result.current[0].updatesOnly).toBe(true);
    });

    test('a stored preference is restored on a fresh mount', () => {
        localStorage.setItem(
            'moduleManagement.updatePreferences',
            JSON.stringify({updatesOnly: true, dryRun: false})
        );

        const {result} = renderHook(() => useModulePreferences());
        const [prefs] = result.current;
        // Restored values win, and missing keys fall back to defaults.
        expect(prefs.updatesOnly).toBe(true);
        expect(prefs.dryRun).toBe(false);
        expect(prefs.autoRefresh).toBe(true); // default preserved
    });

    test('corrupt stored JSON falls back to defaults without throwing', () => {
        localStorage.setItem('moduleManagement.updatePreferences', '{not-json');
        const {result} = renderHook(() => useModulePreferences());
        expect(result.current[0].dryRun).toBe(true);
    });
});

// -------------------------------------------------------------------------------------------
// S41 — page-size selector offered + resets to page 1 on change
// -------------------------------------------------------------------------------------------
describe('ModuleTablePagination page-size selector (S41)', () => {
    const renderPagination = (overrides = {}) => {
        const onPageChange = jest.fn();
        const onItemsPerPageChange = jest.fn();
        render(
            <ModuleTablePagination
                currentPage={1}
                itemsPerPage={20}
                totalItems={100}
                onPageChange={onPageChange}
                onItemsPerPageChange={onItemsPerPageChange}
                {...overrides}
            />
        );
        return {onPageChange, onItemsPerPageChange};
    };

    test.each([20, 40, 60])('offers page size %i', size => {
        renderPagination();
        const select = screen.getByLabelText(/items per page/i);
        const values = Array.from(select.options).map(o => Number(o.value));
        expect(values).toContain(size);
    });

    test('changing the page size propagates the new size AND resets to page 1', () => {
        const {onPageChange, onItemsPerPageChange} = renderPagination({currentPage: 3});
        const select = screen.getByLabelText(/items per page/i);

        fireEvent.change(select, {target: {value: '40'}});

        expect(onItemsPerPageChange).toHaveBeenCalledWith(40);
        expect(onPageChange).toHaveBeenCalledWith(1);
    });

    test('the "Showing from-to-of" label reflects the current page window', () => {
        renderPagination({currentPage: 2, itemsPerPage: 20, totalItems: 100});
        // page 2 at 20-per-page over 100 => showing 21..40 of 100
        const label = screen.getByText(/label\.pagination\.showing/);
        expect(label.textContent).toContain('"from":21');
        expect(label.textContent).toContain('"to":40');
        expect(label.textContent).toContain('"total":100');
    });

    test('Previous is disabled on the first page and does not fire onPageChange', () => {
        const {onPageChange} = renderPagination({currentPage: 1, itemsPerPage: 20, totalItems: 40});
        const prev = screen.getByText('label.pagination.previous');
        expect(prev.disabled).toBe(true);
        fireEvent.click(prev);
        expect(onPageChange).not.toHaveBeenCalled();
    });
});

/**
 * S37 note (type-filter change resets pagination to page 1):
 * the reset-to-page-1 contract is enforced by ModuleTablePagination's onChange handler, asserted
 * above (page-size change -> onPageChange(1)). The parent ModuleManagementCommunityApp wires the
 * same reset on its type/name/updates filter changes, but exercising THAT requires mounting the
 * full app with Apollo + moonstone + i18n providers and a seeded GraphQL cache — brittle and out
 * of scope for a unit run. The pure filter predicates the parent applies on those same state
 * changes are covered directly in utils/moduleUtils.test.js (S35/S36/S38/S39).
 */
