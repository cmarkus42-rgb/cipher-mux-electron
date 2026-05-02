import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/', 'out/', 'node_modules/', 'scripts/'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/\\/Users\\/Shared\\/Nextcloud/]',
          message: 'Use BRAND.* constants from src/shared/brand.ts instead of hardcoded cipher paths.',
        },
      ],
    },
  },
)
