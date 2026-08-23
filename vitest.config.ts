import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // esbuild handles JSX; no framework plugin needed for these tests.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@matra/core': resolve(__dirname, 'packages/core/src/index.ts') },
  },
  test: {
    environment: 'happy-dom',
    include: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/*.test.tsx'],
  },
})
