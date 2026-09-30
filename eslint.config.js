import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/', 'out/', 'node_modules/', 'scripts/',
      // Vendored VAD/ONNX runtime: minified bundles and wasm glue, no own
      // code. They contributed 421 of 830 lint problems -- half the total --
      // from files nobody will ever edit. A count dominated by third-party
      // minification says nothing about this project's code.
      'src/renderer/public/vad-assets/',
      // Archived snapshot, kept for reference, not built or shipped.
      'conserved/',
    ],
  },
  ...tseslint.configs.recommended,
  {
    // Reine .js-Dateien sind hier CommonJS-Worker (piper-worker.js laeuft als
    // Kindprozess ohne Build-Schritt). require() ist dort das Modulsystem,
    // nicht ein Stilfehler.
    files: ['**/*.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
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
