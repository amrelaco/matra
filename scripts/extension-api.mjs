#!/usr/bin/env node
/**
 * The reference for every extension that ships, read off the extensions.
 *
 * There are eighty-one of them. A hand-written page listing their commands and
 * keys would be wrong within a release and wrong silently — the failure mode is
 * a developer copying a command that no longer exists, which looks like their
 * bug rather than ours. So nothing here is typed by a person: the definitions
 * are imported and reflected over, the option fields come from the emitted
 * `.d.ts`, and the prose comes from the doc comment already written above each
 * export in its source file.
 *
 * That last part is the reason this reads as documentation rather than as a
 * schema dump. The comments are good because they were written to explain the
 * code to whoever touched it next; this only moves them somewhere a developer
 * will look before they touch it at all.
 *
 * Run after a build — it reads `dist`, not `src`, because what a developer
 * imports is what was built.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const dist = join(root, 'packages/core/dist')
const out = join(root, 'apps/site/src/data/extensions-api.json')

if (!existsSync(join(dist, 'index.js'))) {
  console.error('packages/core/dist is missing · run `pnpm build` first')
  process.exit(1)
}

const core = await import(join(dist, 'index.js'))
const types = readFileSync(join(dist, 'index.d.ts'), 'utf8')

const isDef = (v) =>
  v &&
  typeof v === 'object' &&
  typeof v.name === 'string' &&
  ['node', 'mark', 'extension'].includes(v.kind)

/**
 * A factory is an extension you configure. Some require their options — the
 * placeholder needs its text — so the empty call is tried and allowed to fail
 * before falling back to an empty object.
 */
const callFactory = (fn) => {
  for (const args of [[], [{}], [{ text: '' }]]) {
    try {
      const r = fn(...args)
      if (isDef(r) || (Array.isArray(r) && r.length && r.every(isDef))) return r
    } catch {}
  }
  return null
}

/* --- which file each export came from ------------------------------------ */

/**
 * The barrel says where every export lives, which is what turns an export name
 * into the doc comment above it. Parsed rather than guessed: `subscript` and
 * `superscript` share a file, and `tableKit` is not in `table-kit.ts`.
 */
const barrel = readFileSync(join(root, 'packages/core/src/extensions/index.ts'), 'utf8')
const fileOf = new Map()
for (const [, names, file] of barrel.matchAll(
  /export\s*\{([^}]+)\}\s*from\s*'\.\/([\w-]+)'/g,
)) {
  for (const raw of names.split(',')) {
    const name = raw
      .replace(/\btype\b/, '')
      .trim()
      .split(/\s+as\s+/)
      .pop()
    if (name) fileOf.set(name, file)
  }
}

const sourceCache = new Map()
const sourceOf = (file) => {
  if (!sourceCache.has(file)) {
    const path = join(root, 'packages/core/src/extensions', `${file}.ts`)
    sourceCache.set(file, existsSync(path) ? readFileSync(path, 'utf8') : '')
  }
  return sourceCache.get(file)
}

/** Strip a block comment down to the prose inside it. */
const clean = (block) =>
  block
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\*ic?\s?/, '').replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim()

/**
 * Prose paragraphs and code examples, kept apart.
 *
 * Fifteen of these comments carry a fenced example, and they are the most
 * useful thing in the file — `fileHandler` is barely explicable without one.
 * Collapsing newlines the way prose needs would run the example into a single
 * unreadable line, so a fence is lifted out whole and its whitespace left
 * exactly as written.
 */
const blocks = (text) => {
  const out = []
  const fence = /```(\w*)\n([\s\S]*?)```/g
  let last = 0
  const prose = (chunk) => {
    for (const p of chunk.split(/\n\s*\n/)) {
      const line = p.replace(/\s*\n\s*/g, ' ').trim()
      if (line) out.push({ type: 'text', text: line })
    }
  }
  for (const match of text.matchAll(fence)) {
    prose(text.slice(last, match.index))
    out.push({ type: 'code', lang: match[1] || 'ts', text: match[2].replace(/\s+$/, '') })
    last = match.index + match[0].length
  }
  prose(text.slice(last))
  return out
}

/**
 * The doc comment immediately above an export, from its own source file.
 *
 * Anchored to the declaration rather than searched for near it: several files
 * export more than one thing, and the comment above `tableRow` is not the
 * comment about tables.
 */
const docFor = (exportName) => {
  const file = fileOf.get(exportName)
  if (!file) return []
  const src = sourceOf(file)
  const decl = new RegExp(`export\\s+(?:const|function)\\s+${exportName}\\b`)
  const at = src.search(decl)
  if (at === -1) return []
  // Walk back from the declaration rather than matching forward to it. A lazy
  // `[\\s\\S]*?` finds the leftmost start in the file, so `placeholder` was
  // documented with the comment from a field of `PlaceholderOptions` — the last
  // `*/` before the export was right, the `/**` it was paired with was not.
  const before = src.slice(0, at).trimEnd()
  if (!before.endsWith('*/')) return []
  const open = before.lastIndexOf('/**')
  if (open === -1) return []
  return blocks(clean(before.slice(open)))
}

/* --- options, from the emitted types ------------------------------------- */

/**
 * Option fields for a configurable extension.
 *
 * Read from the `.d.ts` because that is the contract a consumer compiles
 * against. The interface name is the export name capitalised plus `Options`,
 * which holds for every one of them; where it does not, the extension simply
 * reports no options rather than reporting someone else's.
 */
const optionsFor = (exportName) => {
  const iface = `${exportName[0].toUpperCase()}${exportName.slice(1)}Options`
  const start = types.indexOf(`interface ${iface} {`)
  if (start === -1) return null
  let depth = 0
  let end = start
  for (let i = types.indexOf('{', start); i < types.length; i++) {
    if (types[i] === '{') depth++
    else if (types[i] === '}' && --depth === 0) {
      end = i
      break
    }
  }
  const body = types.slice(types.indexOf('{', start) + 1, end)

  const fields = []
  const fieldRe = /(?:(\/\*\*(?:[^*]|\*(?!\/))*\*\/)\s*)?(\w+)(\??):\s*([^;]+);/g
  for (const [, comment, name, optional, type] of body.matchAll(fieldRe)) {
    fields.push({
      name,
      type: type.replace(/\s+/g, ' ').trim(),
      required: optional !== '?',
      doc: comment ? blocks(clean(comment)) : [],
    })
  }
  return { interface: iface, fields }
}

/* --- sizes ---------------------------------------------------------------- */

const sizeData = JSON.parse(
  readFileSync(join(root, 'apps/site/src/data/extension-sizes.json'), 'utf8'),
)
const gzOf = new Map((sizeData.extensions ?? []).map((e) => [e.name, e.gz]))

/* --- walk the exports ----------------------------------------------------- */

const cssExports = new Set(
  Object.entries(core)
    .filter(([k, v]) => typeof v === 'string' && /CSS$/.test(k))
    .map(([k]) => k),
)

const kits = new Map()
for (const [name, value] of Object.entries(core)) {
  if (Array.isArray(value) && value.length && value.every(isDef)) {
    kits.set(
      name,
      value.map((d) => d.name),
    )
  }
}

/** Definition name → the kits that include it, for "you already have this". */
const inKits = new Map()
for (const [kit, members] of kits) {
  for (const m of members) inKits.set(m, [...(inKits.get(m) ?? []), kit])
}

/**
 * What the extension reads and writes in HTML.
 *
 * `bold` has no doc comment and does not need one — "parses strong, b · renders
 * strong" is the whole story, and it is a fact about the definition rather than
 * a sentence someone has to keep true. This is what stops the twenty-eight
 * undocumented built-ins from rendering as an empty entry.
 */
const domOf = (def) => {
  const parses = (def.parseDOM ?? [])
    .map((rule) => rule?.tag ?? (rule?.style ? `[style: ${rule.style}]` : null))
    .filter(Boolean)
  let renders = null
  try {
    // Marks take no argument; nodes are handed their own defaults.
    const attrs = Object.fromEntries(
      Object.entries(def.attrs ?? {}).map(([k, v]) => [k, v?.default ?? null]),
    )
    const shape = def.toDOM?.({ attrs, content: { content: [] } })
    if (Array.isArray(shape) && typeof shape[0] === 'string') renders = shape[0]
  } catch {}
  return { parses, renders }
}

const describe = (exportName, def, { configurable }) => ({
  importName: exportName,
  name: def.name,
  kind: def.kind,
  dom: domOf(def),
  configurable,
  group: def.group ?? null,
  content: def.content ?? null,
  commands: Object.keys(def.commands ?? {}),
  keys: Object.entries(def.keys ?? {}).map(([combo, command]) => ({ combo, command })),
  attrs: Object.entries(def.attrs ?? {}).map(([attr, spec]) => ({
    name: attr,
    default:
      spec && typeof spec === 'object' && 'default' in spec ? (spec.default ?? null) : null,
  })),
  css: cssExports.has(`${exportName}CSS`) ? `${exportName}CSS` : null,
  kits: inKits.get(def.name) ?? [],
  gz: gzOf.get(def.name) ?? gzOf.get(exportName) ?? null,
  options: configurable ? optionsFor(exportName) : null,
  doc: docFor(exportName),
})

const extensions = []
for (const [exportName, value] of Object.entries(core)) {
  if (isDef(value)) {
    extensions.push(describe(exportName, value, { configurable: false }))
    continue
  }
  if (typeof value !== 'function') continue
  const result = callFactory(value)
  if (!result) continue
  // A factory returning several definitions is a kit that takes options; the
  // first is the one the export is named for.
  const def = Array.isArray(result) ? result[0] : result
  extensions.push(describe(exportName, def, { configurable: true }))
}

extensions.sort((a, b) => a.importName.localeCompare(b.importName))

/**
 * Kits list their members by the definition's own name, which is not always
 * what you import: `document` is the export, `doc` is the node. The reference
 * links by export name, so the two are reconciled here rather than leaving a
 * page of links to routes that do not exist.
 */
const importNameOf = new Map(extensions.map((e) => [e.name, e.importName]))
const kitsOut = [...kits].map(([name, members]) => ({
  name,
  members: members.map((m) => importNameOf.get(m) ?? m),
}))

const payload = {
  measured: new Date().toISOString().slice(0, 10),
  package: '@matrajs/core',
  counts: {
    extensions: extensions.length,
    configurable: extensions.filter((e) => e.configurable).length,
    commands: new Set(extensions.flatMap((e) => e.commands)).size,
    documented: extensions.filter((e) => e.doc.length).length,
  },
  kits: kitsOut,
  extensions,
}

writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`)

/* --- the same reference, as Markdown -------------------------------------- */

/**
 * Written here as well as rendered by the Astro page, because the MCP server
 * and `llms-full.txt` cannot read the page.
 *
 * `scripts/docs-bundle.mjs` converts the docs by parsing the `.astro` source,
 * and an Astro `{expr}` has no data behind it at that point — a page whose body
 * is a `.map()` over data arrives as the literal text `groups.map(...)`. That
 * is why `docs-shortcuts.md` currently ships no shortcuts. Reading the built
 * HTML instead would fix every such page at once, but the mcp package is built
 * before the site is, so `dist` does not exist yet.
 *
 * So this file is the pre-rendered form, generated from the same payload the
 * page renders, and the bundler prefers it over converting the page. One
 * source of truth, two renderers.
 */
const md = []
md.push('# Every extension\n')
md.push(
  `All ${payload.counts.extensions} extensions live in \`@matrajs/core\` and carry ${payload.counts.commands} commands between them. There is no separate package to install for any one of them.\n`,
)
md.push('## Installing only what you want\n')
md.push(
  'There is no `@matrajs/table` package. You already have the table; you turn it on by importing it.\n',
)
md.push('```sh\nnpm install @matrajs/core\n```\n')
md.push('A table and nothing else:\n')
md.push(
  "```ts\nimport { createEditor, document, paragraph, text, tableKit } from '@matrajs/core'\n\nconst editor = createEditor({\n  extensions: [document, paragraph, text, ...tableKit],\n  element: document.querySelector('#editor'),\n})\n```\n",
)
md.push(
  '`document`, `paragraph` and `text` are the floor: every document is a `document` holding blocks, and a table cell holds blocks, so a table without them has nothing legal to contain. Extensions you do not import are not in the build — ordinary tree-shaking, not a plugin system.\n',
)

md.push('## Kits\n')
md.push('A kit is an array of definitions, spread with `...`.\n')
for (const kit of payload.kits)
  md.push(`- \`${kit.name}\` — ${kit.members.map((m) => `\`${m}\``).join(', ')}`)
md.push('')

const KIND_TITLES = { node: 'Nodes', mark: 'Marks', extension: 'Behaviour' }
for (const kind of ['node', 'mark', 'extension']) {
  const items = extensions.filter((e) => e.kind === kind)
  md.push(`## ${KIND_TITLES[kind]}\n`)
  for (const e of items) {
    md.push(`### ${e.importName}\n`)
    const tags = [
      e.configurable ? 'takes options' : null,
      ...e.kits.map((k) => `in ${k}`),
      e.gz != null ? `${e.gz} kB gzipped` : null,
    ].filter(Boolean)
    if (tags.length) md.push(`*${tags.join(' · ')}*\n`)
    for (const block of e.doc) {
      md.push(
        block.type === 'code'
          ? `\`\`\`${block.lang}\n${block.text}\n\`\`\`\n`
          : `${block.text}\n`,
      )
    }
    md.push(`\`\`\`ts\nimport { ${e.importName} } from '@matrajs/core'\n\`\`\`\n`)
    if (e.options?.fields.length) {
      md.push('| Option | Type | |')
      md.push('| --- | --- | --- |')
      for (const f of e.options.fields) {
        const note = f.doc
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join(' ')
        md.push(`| \`${f.name}\`${f.required ? ' (required)' : ''} | \`${f.type}\` | ${note} |`)
      }
      md.push('')
    }
    if (e.commands.length)
      md.push(
        `**Commands** — ${e.commands.map((c) => `\`editor.commands.${c}()\``).join(', ')}\n`,
      )
    if (e.keys.length)
      md.push(`**Keys** — ${e.keys.map((k) => `\`${k.combo}\` ${k.command}`).join(', ')}\n`)
    if (e.attrs.length)
      md.push(
        `**Attributes** — ${e.attrs.map((a) => `\`${a.name}${a.default != null ? ` = ${JSON.stringify(a.default)}` : ''}\``).join(', ')}\n`,
      )
    const dom = []
    if (e.dom.parses.length)
      dom.push(`parses ${e.dom.parses.map((t) => `\`${t}\``).join(', ')}`)
    if (e.dom.renders) dom.push(`renders \`${e.dom.renders}\``)
    if (dom.length) md.push(`**HTML** — ${dom.join(' · ')}\n`)
    if (e.css)
      md.push(
        `**Styles** — \`import { ${e.css} } from '@matrajs/core'\`, a stylesheet string.\n`,
      )
  }
}

const mdOut = join(root, 'apps/site/src/data/extension-reference.md')
writeFileSync(mdOut, `${md.join('\n').replace(/\n{3,}/g, '\n\n')}\n`)

// Formatted here rather than left for `pnpm fix`. A generator whose output
// fails `pnpm check` turns every regeneration into a second manual step, and
// the one time it is forgotten it fails in CI instead.
const formatted = spawnSync('npx', ['biome', 'format', '--write', out], { encoding: 'utf8' })
if (formatted.status !== 0) {
  console.error(`biome could not format ${out}:\n${formatted.stderr ?? ''}`)
  process.exit(1)
}

console.log(
  `wrote ${out} · ${payload.counts.extensions} extensions, ${payload.counts.commands} commands, ${payload.counts.documented} with prose`,
)

const undocumented = extensions.filter((e) => !e.doc.length).map((e) => e.importName)
if (undocumented.length) console.log(`no doc comment: ${undocumented.join(', ')}`)
