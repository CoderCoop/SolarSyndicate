import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    // Test against source, not build output, so a failing test points at a line
    // you can edit.
    alias: {
      '@solsyn/data': src('./packages/data/src/index.ts'),
      '@solsyn/sim': src('./packages/sim/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts', 'apps/**/test/**/*.test.ts'],
  },
})
