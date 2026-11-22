import globals from 'globals';

const workerFiles = ['src/**/*worker.js', 'src/cad-worker-runtime.js'];
const files = ['src/**/*.js', 'backend/**/*.{js,mjs,cjs}', 'ai/*.mjs', 'electron.cjs', 'preload.cjs', 'vite.config.js'];

export default [
  {
    ignores: [
      '**/node_modules/**',
      'dist/**',
      'work/**',
      'mini/**',
      'mini-cad/**',
      'tests/**',
      'scripts/**',
      'cad-kernel-build/**',
      'licenses/**',
      'src/fonts/**',
      'converter/**',
      'parametric/**',
      'python-runtime/**',
      '**/*.wasm',
      'docs/**',
    ],
  },
  {
    files,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'no-undef': 'warn',
      'no-unused-vars': 'warn',
      'no-empty': 'warn',
      'no-dupe-keys': 'warn',
    },
  },
  {
    files: ['src/**/*.js'],
    ignores: workerFiles,
    languageOptions: { globals: globals.browser },
  },
  {
    files: workerFiles,
    languageOptions: { globals: globals.worker },
  },
  {
    files: ['backend/**/*.cjs', 'electron.cjs', 'preload.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['backend/**/*.{js,mjs}', 'vite.config.js'],
    languageOptions: { globals: globals.nodeBuiltin },
  },
  {
    files: ['ai/*.mjs'],
    languageOptions: { globals: { structuredClone: 'readonly' } },
  },
];
