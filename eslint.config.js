import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/dev-dist/**', '**/*.tsbuildinfo'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },

  // Service workers run in their own global scope, not a window.
  {
    files: ['docs/sw.js'],
    languageOptions: {
      globals: {
        self: 'readonly',
        caches: 'readonly',
      },
    },
  },

  // Build-time and verification scripts run in Node, not the browser.
  {
    files: ['**/scripts/**/*.mjs', '**/*.config.{js,mjs,ts}'],
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        // Evaluated inside the page by Playwright, not in Node.
        navigator: 'readonly',
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Determinism guard (design doc §12.2 risk 5).
  //
  // The sim must be a pure function of (state, events, wall-clock passed IN).
  // A single Math.random() or Date.now() inside packages/sim silently breaks
  // offline catch-up reproducibility, save verification, and the future
  // server-authoritative path -- and it breaks them in ways tests only catch by
  // luck. So it is a lint error, not a convention.
  //
  // Randomness: use rng.ts (seeded, keyed by entity + counter).
  // Wall-clock:  the caller passes UTC in; the sim never reads the clock.
  // ---------------------------------------------------------------------------
  {
    files: ['packages/sim/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message:
            'Non-deterministic. Use the seeded PRNG in rng.ts (rngFor(seed, streamId, counter)).',
        },
        {
          object: 'Date',
          property: 'now',
          message:
            'The sim never reads the clock. Wall-clock time is passed in as a parameter (see time.ts).',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'performance',
          message: 'Non-deterministic. The sim must not observe real elapsed time.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'The sim never reads the clock. Wall-clock time is passed in as a parameter (see time.ts).',
        },
      ],
    },
  },
)
