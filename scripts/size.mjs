#!/usr/bin/env node
/**
 * Guard the number on the landing page.
 *
 * "24.5 kB against Tiptap's 117" is a claim made in public, which means it is
 * a thing that can quietly stop being true. This bundles the editor the way an
 * application would and fails if it has outgrown its budget.
 */
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const BUDGET_KB = 26

const result = await build({
  stdin: {
    contents: `
      import { createEditor, starterKit } from './packages/core/dist/index.js'
      export const editor = () => createEditor({ extensions: starterKit })
    `,
    resolveDir: process.cwd(),
    loader: 'js',
  },
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'browser',
  write: false,
  logLevel: 'silent',
})

const code = result.outputFiles[0].contents
const gzipped = gzipSync(code).length / 1024

console.log(`core + starter kit: ${gzipped.toFixed(1)} kB gzipped (budget ${BUDGET_KB} kB)`)

if (gzipped > BUDGET_KB) {
  console.error(
    `\nOver budget by ${(gzipped - BUDGET_KB).toFixed(1)} kB.
Either trim it, or raise the budget here and change every page that quotes the old number.`,
  )
  process.exit(1)
}
