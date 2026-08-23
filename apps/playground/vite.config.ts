import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: { matra: resolve(__dirname, '../../packages/core/src/index.ts') },
  },
})
