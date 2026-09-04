#!/usr/bin/env node
/**
 * Guard the numbers on the site, and write the ones the site prints.
 *
 * "24.6 kB against Tiptap's 117" is a claim made in public, which means it is a
 * thing that can quietly stop being true. This bundles the editor the way an
 * application would, fails if it has outgrown its budget, and writes the whole
 * ladder to `apps/site/src/data/sizes.json` so the page showing what a smaller
 * extension array costs cannot drift from what it actually costs.
 *
 * `--check` fails instead of writing, which is what CI wants: a number nobody
 * regenerated is a number nobody can trust.
 */
import { readFile, stat, writeFile } from 'node:fs/promises'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

/*
 * 26 through 0.16. Raised to 30 at 1.0, when the engine learned to add one
 * extension's attributes to another's nodes, take pastes and drops from
 * extensions, let an extension refuse a change or render another's node,
 * accept a file or text dropped from outside, put a block into the middle of
 * a paragraph, paste paragraphs into a paragraph and lines of text as lines,
 * change a node's attributes without moving what is inside it, compare
 * decorations after mapping them, patch a paragraph's text in place, find
 * positions by bisection and share a compiled schema between editors. Every
 * rung is measured, and the figure printed on the site is the one measured
 * here.
 */
const BUDGET_KB = 30
const OUT = 'apps/site/src/data/sizes.json'
const CHECK = process.argv.includes('--check')

const FROM = "'./packages/core/dist/index.js'"

/*
 * Refuse to measure a bundle older than the source it came from.
 *
 * This reads dist, not src, so running it after an edit and before a build
 * measures the previous version and reports it as current. That is not a
 * near-miss: it happened, `--check` said the budget was met, and the figure
 * on the landing page was wrong by the size of a feature that had just been
 * added. A stale answer that looks like a fresh one is the worst thing this
 * script can do, so it stops instead.
 */
async function newestUnder(dir) {
  let newest = 0
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    newest = Math.max(
      newest,
      entry.isDirectory() ? await newestUnder(path) : (await stat(path)).mtimeMs,
    )
  }
  return newest
}

async function assertFresh() {
  let built
  try {
    built = (await stat('packages/core/dist/index.js')).mtimeMs
  } catch {
    console.error('No packages/core/dist. Run `pnpm build` first.')
    process.exit(1)
  }
  const edited = await newestUnder('packages/core/src')
  if (edited > built) {
    console.error('packages/core/dist is older than packages/core/src.')
    console.error('Run `pnpm build` first — measuring the last build reports the last version.')
    process.exit(1)
  }
}

await assertFresh()

/**
 * Each rung of the ladder, smallest first.
 *
 * The point is not that a smaller array is much smaller — it is not, and the
 * page says so. The point is that the engine is the floor and the extensions
 * are rounding, which is the honest answer to "should I install only bold".
 */
const LADDER = [
  {
    id: 'engine',
    label: 'The engine on its own',
    note: 'createEditor, with an empty array',
    source: `
      import { createEditor } from ${FROM}
      export const editor = () => createEditor({ extensions: [] })
    `,
  },
  {
    id: 'two-marks',
    label: 'Bold and underline',
    note: 'document, paragraph, text, bold, underline',
    source: `
      import { createEditor, document, paragraph, text, bold, underline } from ${FROM}
      export const editor = () =>
        createEditor({ extensions: [document, paragraph, text, bold, underline] })
    `,
  },
  {
    id: 'marks',
    label: 'The everyday six',
    note: 'every mark, and nothing that makes a block',
    source: `
      import {
        createEditor, document, paragraph, text,
        bold, italic, strike, code, underline, highlight,
      } from ${FROM}
      export const editor = () =>
        createEditor({
          extensions: [document, paragraph, text, bold, italic, strike, code, underline, highlight],
        })
    `,
  },
  {
    id: 'starter',
    label: 'The starter kit',
    note: 'what most applications start from',
    source: `
      import { createEditor, starterKit } from ${FROM}
      export const editor = () => createEditor({ extensions: starterKit })
    `,
  },
  {
    id: 'everything',
    label: 'Starter kit, tables and checklists',
    note: 'more than most pages need',
    source: `
      import { createEditor, starterKit, tableKit, taskList, taskItem } from ${FROM}
      export const editor = () =>
        createEditor({ extensions: [...starterKit, ...tableKit, taskList, taskItem] })
    `,
  },
]

const measure = async (source) => {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: 'js' },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
  })
  const code = result.outputFiles[0].contents
  return {
    min: Number((code.length / 1024).toFixed(1)),
    gz: Number((gzipSync(code).length / 1024).toFixed(1)),
  }
}

const rungs = []
for (const rung of LADDER) {
  const { min, gz } = await measure(rung.source)
  rungs.push({ id: rung.id, label: rung.label, note: rung.note, min, gz })
  console.log(
    `${rung.label.padEnd(34)} ${String(min).padStart(6)} kB min  ${String(gz).padStart(5)} kB gz`,
  )
}

const starter = rungs.find((rung) => rung.id === 'starter')
if (!starter) throw new Error('Matra: the starter kit rung disappeared from the ladder')

console.log(`\ncore + starter kit: ${starter.gz} kB gzipped (budget ${BUDGET_KB} kB)`)

if (starter.gz > BUDGET_KB) {
  console.error(
    `\nOver budget by ${(starter.gz - BUDGET_KB).toFixed(1)} kB.
Either trim it, or raise the budget here and change every page that quotes the old number.`,
  )
  process.exit(1)
}

/**
 * Tiptap, measured the same way, by hand.
 *
 * Not measured here, because that would mean depending on four of their
 * packages to print two numbers. `bench/browser` has them installed; re-run it
 * when their version moves, and the date below says how old this is.
 */
const tiptap = {
  version: '3.30',
  minimum: 86.1,
  starter: 117.2,
  measured: '2026-08-27',
}

const next = `${JSON.stringify({ rungs, tiptap, budgetKb: BUDGET_KB }, null, 2)}\n`

if (CHECK) {
  const current = await readFile(OUT, 'utf8').catch(() => '')
  if (current !== next) {
    console.error(`\n${OUT} is out of date. Run \`pnpm size\` and commit the result.`)
    process.exit(1)
  }
  console.log(`${OUT} is current`)
} else {
  await writeFile(OUT, next)
  console.log(`wrote ${OUT}`)
}
