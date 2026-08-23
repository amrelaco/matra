import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: { '@matra/core': resolve(__dirname, '../../packages/core/src/index.ts') },
  },
})
