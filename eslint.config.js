import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'apps/api/drizzle/**', 'apps/web/public/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/floorplan-engine/src/**', 'apps/web/src/**'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/api/**', 'e2e/**', '**/*.config.{js,ts}', '**/scripts/**'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  prettier,
)
