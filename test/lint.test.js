/**
 * Run ESLint as Mocha Tests
 */
const LINTER_SLOW = 1000,
    lint = require('mocha-eslint'),
    paths = [
        'lib/**/*.js',
        'test/**/*.test.js',
    ],
    options = { slow: LINTER_SLOW };

lint(paths, options);
