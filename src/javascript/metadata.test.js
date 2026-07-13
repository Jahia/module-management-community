const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const readPkg = () => JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));

/**
 * S82 — the build's `test` entrypoint now exists (D7). `yarn build` = lint && test && webpack
 * used to fail at `yarn test` because no `test` script and no jest config were present.
 */
describe('build test entrypoint (S82 / D7)', () => {
    test('package.json defines a "test" script', () => {
        const pkg = readPkg();
        expect(pkg.scripts).toBeDefined();
        expect(pkg.scripts.test).toBeDefined();
        expect(pkg.scripts.test).toContain('jest');
    });

    test('jest.config.js exists at the repo root', () => {
        expect(fs.existsSync(path.join(REPO_ROOT, 'jest.config.js'))).toBe(true);
    });
});

/**
 * S81 — package license metadata is internally consistent (D6).
 *
 * FINDING (for Stage 7): the Stage-4 gap assumed the "declared" license is the dual
 * GPL-3.0-or-later / JSEL from the pom.xml + README boilerplate header, and that the
 * package.json "MIT" was a stray. Direct inspection shows the opposite is the real state:
 * LICENSE.txt is an MIT License (Copyright Florent BOURASSÉ) and package.json is "MIT" — those
 * two are consistent. The pom.xml/README carry the standard Jahia GPL/JSEL boilerplate that does
 * NOT match LICENSE.txt. Changing the declared license is a legal decision, not a test-coverage
 * fix, so this spec asserts the package.json↔LICENSE.txt consistency that actually holds and
 * flags the boilerplate discrepancy for human/Stage-7 review rather than mutating the license.
 */
describe('license metadata consistency (S81 / D6)', () => {
    test('package.json license matches the LICENSE.txt license family', () => {
        const pkg = readPkg();
        const licenseTxt = fs.readFileSync(path.join(REPO_ROOT, 'LICENSE.txt'), 'utf8');

        expect(pkg.license).toBeDefined();
        // Both are MIT today — assert they agree rather than asserting an unfounded GPL value.
        expect(licenseTxt).toContain('MIT License');
        expect(pkg.license).toBe('MIT');
    });
});
