/**
 * Jest configuration for the client-side unit tests.
 *
 * Adding this file (plus the "test" script in package.json) fixes D7: previously
 * `yarn build` = `yarn lint && yarn test && yarn webpack` failed at `yarn test`
 * because there was no `test` script and no jest config.
 *
 * Babel options are inlined into the babel-jest transform rather than placed in a
 * root babel.config.js, so this configuration does NOT affect the webpack build
 * (which carries its own babel setup via @jahia/webpack-config).
 */
module.exports = {
    rootDir: '.',
    // Default to node; specs that need the DOM opt in via a `@jest-environment jsdom` docblock.
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/javascript/**/*.test.{js,jsx}'],
    transform: {
        '^.+\\.jsx?$': ['babel-jest', {
            presets: [
                ['@babel/preset-env', {targets: {node: 'current'}}],
                ['@babel/preset-react', {runtime: 'automatic'}]
            ]
        }]
    },
    moduleNameMapper: {
        '\\.(scss|css|sass|less)$': '<rootDir>/jest/styleMock.js'
    },
    collectCoverageFrom: [
        'src/javascript/utils/**/*.js',
        'src/javascript/hooks/**/*.js'
    ]
};
