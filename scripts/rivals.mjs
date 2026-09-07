#!/usr/bin/env node
/**
 * What the other editors actually cost you, measured from the registry.
 *
 * The landing page compares Matra to Tiptap, Lexical and Slate. Every number
 * in that table used to be typed by hand, and three of them had quietly gone
 * wrong: Tiptap's dependency count was measured against version 2, and the
 * rows saying Tiptap charges for a table of contents, unique ids and a drag
 * handle stopped being true when Tiptap 3 moved those extensions to MIT on
 * the public registry.
 *
 * A false claim about a competitor is worse than no claim, so this measures
 * instead of asserting:
 *
 *   - how many packages each editor installs, resolved by npm itself;
 *   - which Tiptap extensions are published publicly under MIT, by asking the
 *     registry for each one, and which are behind the Pro registry.
 *
 * `sizes.json` already carries a `measured` date for the bundle comparison and
 * the page prints it. Same arrangement here: the file says when it was true,
 * and the page says so too.
 *
 *   node scripts/rivals.mjs           measure and write the file
 *   node scripts/rivals.mjs --print   measure and print, writing nothing
 *
 * Needs the network. Deliberately not wired into `pnpm check`: a competitor
 * publishing a patch release must not turn this repository's CI red.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'apps/site/src/data/rivals.json')
const print = process.argv.includes('--print')

/**
 * What every React application already has, or never ships.
 *
 * Counting React against an editor would be counting the application's own
 * dependency four times over, and `@types/*` never reaches a browser. The
 * interesting number is what the editor drags in on top.
 */
const NOT_THEIRS = new Set(['react', 'react-dom', 'scheduler', 'csstype'])
const isTypes = (name) => name.startsWith('@types/')

/** Resolve an install without performing one. npm does the whole tree for us. */
function resolveTree(specs) {
  const dir = mkdtempSync(join(tmpdir(), 'matra-rivals-'))
  try {
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'probe', version: '1.0.0' }),
    )
    const { status, stderr } = spawnSync(
      'npm',
      ['install', '--silent', '--package-lock-only', '--no-audit', '--no-fund', ...specs],
      { cwd: dir, encoding: 'utf8' },
    )
    if (status !== 0) throw new Error(`npm install failed: ${stderr?.trim().slice(0, 200)}`)
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'))
    const names = Object.keys(lock.packages ?? {})
      .filter((key) => key.startsWith('node_modules/'))
      .map((key) => key.slice('node_modules/'.length))
    const versions = lock.packages ?? {}
    return { names, versions }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const EDITORS = [
  {
    id: 'matra',
    label: 'Matra',
    install: ['@matrajs/core', '@matrajs/react'],
    of: '@matrajs/core',
    family: /^@matrajs\//,
  },
  {
    id: 'tiptap',
    label: 'Tiptap',
    install: ['@tiptap/react@3', '@tiptap/starter-kit@3', '@tiptap/pm@3'],
    of: '@tiptap/core',
    family: /^@tiptap\//,
  },
  {
    id: 'lexical',
    label: 'Lexical',
    install: ['lexical', '@lexical/react'],
    of: 'lexical',
    family: /^(@lexical\/|lexical$)/,
  },
  {
    id: 'slate',
    label: 'Slate',
    install: ['slate', 'slate-react', 'slate-history'],
    of: 'slate',
    family: /^slate(-|$)/,
  },
]

/**
 * Tiptap extensions this repository has ever described as paid.
 *
 * Asked one at a time, because "is it free" has exactly one honest answer: is
 * there a public package under an open licence. Nine of these were Pro in
 * Tiptap 2 and are MIT in Tiptap 3, which is the whole reason this file exists.
 */
const TIPTAP_CHECK = [
  'table-of-contents',
  'unique-id',
  'drag-handle',
  'file-handler',
  'emoji',
  'details',
  'invisible-characters',
  'mathematics',
  'node-range',
  'collaboration',
  'collaboration-caret',
]

/**
 * Still behind a Tiptap subscription, and not discoverable from the public
 * registry — there is no package to ask. Kept as a list rather than a
 * measurement, and dated like everything else here.
 */
const TIPTAP_PAID = [
  { id: 'comments', label: 'Comments' },
  { id: 'snapshots', label: 'Snapshots and version history' },
  { id: 'ai', label: 'AI Toolkit and AI Agent' },
  { id: 'track-changes', label: 'Track changes' },
  { id: 'import-export', label: 'DOCX and ODT import and export' },
  { id: 'pages', label: 'Pages (pagination)' },
]

async function licenceOf(name) {
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}/latest`)
  if (!response.ok) return null
  const body = await response.json()
  return { version: body.version, license: body.license ?? null }
}

async function main() {
  const editors = {}
  for (const editor of EDITORS) {
    const { names, versions } = resolveTree(editor.install)
    const theirs = names.filter((name) => !NOT_THEIRS.has(name) && !isTypes(name))
    const own = versions[`node_modules/${editor.of}`]
    /*
      Two numbers, because they answer two different questions. `packages` is
      what appears in the lockfile — the honest headline. `thirdParty` leaves
      out the editor's own scope, which is the number that says whose code you
      are actually taking on: Tiptap's is mostly ProseMirror, and that is worth
      being precise about rather than implying its 50 packages are all Tiptap's.
    */
    editors[editor.id] = {
      label: editor.label,
      install: editor.install,
      version: own?.version ?? null,
      /** Everything npm resolved, including React and types. */
      resolved: names.length,
      /** What the editor brings on top of React and types. */
      packages: theirs.length,
      /** Of those, the ones outside the editor's own scope. */
      thirdParty: theirs.filter((name) => !editor.family.test(name)).length,
    }
    console.error(
      `rivals: ${editor.label} → ${theirs.length} packages, ` +
        `${editors[editor.id].thirdParty} of them third-party`,
    )
  }

  const tiptap = { free: [], paid: TIPTAP_PAID.map((entry) => entry.label) }
  for (const slug of TIPTAP_CHECK) {
    const name = `@tiptap/extension-${slug}`
    const found = await licenceOf(name)
    if (found?.license)
      tiptap.free.push({ name, license: found.license, version: found.version })
    else tiptap.paid.push(name)
  }

  const data = {
    measured: new Date().toISOString().slice(0, 10),
    editors,
    tiptap,
  }

  const json = `${JSON.stringify(data, null, 2)}\n`
  if (print) {
    process.stdout.write(json)
    return
  }
  writeFileSync(OUT, json)
  console.error(`rivals: wrote ${OUT}`)
}

await main()
