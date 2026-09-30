import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'dist-smoke/', 'node_modules/', '*.zip'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { chrome: 'readonly', console: 'readonly', process: 'readonly' },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['scripts/**', 'test/e2e/**'],
    languageOptions: {
      globals: { Buffer: 'readonly', setTimeout: 'readonly', fetch: 'readonly', URL: 'readonly' },
    },
    rules: { 'no-console': 'off' },
  },
  {
    // Page functions passed to page.evaluate / addInitScript run in the browser.
    files: ['test/e2e/**'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        getComputedStyle: 'readonly',
        requestAnimationFrame: 'readonly',
      },
    },
  },
);
