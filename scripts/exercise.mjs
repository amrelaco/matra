#!/usr/bin/env node
/**
 * Every extension, driven through the built package, in a DOM.
 *
 * The same checks the install matrix runs inside each framework app, run
 * here in seconds against `packages/core/dist` — so a broken command is
 * found before five apps are installed to find it. Run after `pnpm build`.
 *
 *   node scripts/exercise.mjs            run, print a row per check
 *   node scripts/exercise.mjs --quiet    only the failures
 */
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { browserlike } from './matrix/dom.mjs'
import { everything, exercise } from './matrix/exercise.js'

const ROOT = resolve(import.meta.dirname, '..')
const dist = join(ROOT, 'packages/core/dist/index.js')
if (!existsSync(dist)) {
  console.error('exercise: packages/core is not built · run `pnpm build` first')
  process.exit(1)
}
const quiet = process.argv.includes('--quiet')

const window = await browserlike()
const core = await import(pathToFileURL(dist).href)
const { defs, hooks } = everything(core, window.document)
const editor = core.createEditor({ extensions: defs, content: '<p>hello</p>' })
const host = window.document.createElement('div')
window.document.body.appendChild(host)
editor.mount(host)

const report = await exercise(editor, core, hooks, defs)
for (const row of report.results) {
  if (row.ok && quiet) continue
  console.log(
    `  ${row.ok ? 'ok  ' : 'FAIL'} ${row.name}${row.detail ? ` · ${row.detail}` : ''}`,
  )
}
if (report.uncovered.length) {
  console.error(`\nno check covers: ${report.uncovered.join(', ')}`)
}
console.log(
  `\n${report.count} extensions in one editor · ${report.checks} checks · ${report.failed} failed`,
)
editor.destroy()
process.exit(report.failed ? 1 : 0)
