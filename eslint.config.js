// @ts-check

const tseslint = require('typescript-eslint')
const eslint = require('@eslint/js')

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'client/node_modules/**',
      'client/out/**',
      'server/node_modules/**',
      'server/out/**'
    ]
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      semi: ['error', 'never'],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-case-declarations': 'off'
    }
  }
)
