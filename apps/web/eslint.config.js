import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const supabaseMessage = 'Components must not talk to Supabase. Add a function in src/data and call it through a hook in src/hooks.'

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
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@supabase/*'], message: supabaseMessage },
          { group: ['**/lib/supabase', '**/lib/supabase.ts'], message: supabaseMessage },
        ],
      }],
    },
  },
  // Test helpers export several stand-in components from one file; fast refresh does not apply to them.
  {
    files: ['src/test/**', 'src/**/*.test.{ts,tsx}'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
