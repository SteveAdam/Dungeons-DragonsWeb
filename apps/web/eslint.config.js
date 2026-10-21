import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const supabaseMessage =
  'Components must not talk to Supabase. Add a function in src/data and call it through a hook in src/hooks.';
const storageMessage =
  'Map images go through the storage module: use mapImageStore from src/lib/storage, never supabase.storage.';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // P0-7: only src/data and src/lib (and src/auth, which owns sign-in) may use Supabase.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/data/**', 'src/lib/**', 'src/auth/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@supabase/*'], message: supabaseMessage },
            { group: ['**/lib/supabase', '**/lib/supabase.ts'], message: supabaseMessage },
          ],
        },
      ],
    },
  },
  // P0-9: map images go through src/lib/storage only. Nothing else may touch supabase.storage or import the
  // storage SDK, so the image store can be swapped (e.g. for Cloudflare R2) in one place.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/lib/storage/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='storage'][object.name='supabase']",
          message: storageMessage,
        },
        {
          selector: "MemberExpression[property.name='storage'][object.property.name='supabase']",
          message: storageMessage,
        },
        {
          // const { storage } = supabase
          selector: "VariableDeclarator[init.name='supabase'] > ObjectPattern > Property[key.name='storage']",
          message: storageMessage,
        },
      ],
    },
  },
  // The storage SDK: blocked in the folders the P0-7 rule allows Supabase in (it already blocks @supabase/* elsewhere).
  {
    files: ['src/data/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}', 'src/auth/**/*.{ts,tsx}'],
    ignores: ['src/lib/storage/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@supabase/storage-js'], message: storageMessage }] }],
    },
  },
  // Test helpers export several stand-in components from one file; fast refresh does not apply to them.
  {
    files: ['src/test/**', 'src/**/*.test.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]);
