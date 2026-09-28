import globals from 'globals';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
  {
    files: ['eslint.config.js', 'vite.config.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  {
    files: ['playwright.config.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    files: ['app.js', 'lib/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // Possible Errors
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-duplicate-case': 'error',
      'no-empty': 'error',
      'no-extra-semi': 'error',
      'no-unreachable': 'error',

      // Best Practices
      curly: ['error', 'all'],
      'default-case': 'warn',
      'dot-notation': 'error',
      eqeqeq: ['error', 'always'],
      'no-alert': 'warn',
      'no-else-return': 'error',
      'no-empty-function': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-multi-spaces': 'error',
      'no-return-assign': 'error',
      'no-unused-expressions': 'error',
      'no-useless-return': 'error',

      // Variables
      'no-shadow': 'error',
      'no-undef': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-use-before-define': ['error', { functions: false }],

      // Stylistic (handled by Prettier, but keeping some semantic ones)
      'no-lonely-if': 'error',
      'no-nested-ternary': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', '*.min.js', 'test-results/**', 'playwright-report/**'],
  },
  eslintConfigPrettier,
];
