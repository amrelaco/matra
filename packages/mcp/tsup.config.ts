import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    treeshake: true,
    sourcemap: true,
  },
  {
    // The executable: ESM only, with the shebang the source carries.
    entry: ['src/cli.ts'],
    format: ['esm'],
    treeshake: true,
    sourcemap: true,
  },
])
