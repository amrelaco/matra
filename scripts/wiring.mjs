/**
 * Every element the site's scripts reach for has to exist.
 *
 * The send button on the chat demo did nothing for a while. Nothing threw and
 * nothing was logged: `demos.ts` asked for `#chat-send`, the markup said
 * `class="send"`, the guard that checks all three elements were found quietly
 * failed, and the whole block — click to send *and* Enter to send — was dead.
 * A page can be built, linted, type-checked and shipped in that state, because
 * a missing id is not a type error and not a broken link. It is only a bug when
 * somebody presses the button.
 *
 * So: read the ids out of the scripts, read the ids out of the markup, and
 * complain about the difference.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const SCRIPTS = 'apps/site/src/scripts'
const MARKUP = ['apps/site/src/pages', 'apps/site/src/layouts', 'apps/site/src/components']

/** Every file under a directory, recursively. */
async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(path)))
    else out.push(path)
  }
  return out
}

const read = async (paths) =>
  Object.fromEntries(
    await Promise.all(paths.map(async (path) => [path, await readFile(path, 'utf8')])),
  )

const scripts = await read((await walk(SCRIPTS)).filter((p) => p.endsWith('.ts')))
const markup = await read((await Promise.all(MARKUP.map(walk))).flat())

const allMarkup = Object.values(markup).join('\n')

/** Ids the markup spells out. */
const defined = new Set()
for (const match of allMarkup.matchAll(/\bid="([^"{}]+)"/g)) defined.add(match[1])

/**
 * Ids the markup builds from a template.
 *
 * `id={`ed-${group.id}`}` cannot be read literally, so what is recorded is the
 * fixed part. A mount whose name starts with one of these is taken on trust —
 * a weaker check than the literal one, and better than dropping the whole file
 * from the sweep because one page generates its markup.
 */
const prefixes = []
for (const match of allMarkup.matchAll(/\bid=\{`([^`$]*)\$\{/g)) prefixes.push(match[1])

const declares = (id) => defined.has(id) || prefixes.some((prefix) => id.startsWith(prefix))

const problems = []

// --- getElementById -----------------------------------------------------------
for (const [file, source] of Object.entries(scripts)) {
  for (const match of source.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
    if (declares(match[1])) continue
    problems.push(`${file}: getElementById('${match[1]}') · no id="${match[1]}" in the markup`)
  }
  // `#thing` inside a querySelector is the same mistake wearing a hat.
  for (const match of source.matchAll(/querySelector(?:All)?\(['"]#([\w-]+)['"]\)/g)) {
    if (declares(match[1])) continue
    problems.push(`${file}: querySelector('#${match[1]}') · no id="${match[1]}" in the markup`)
  }
}

// --- the demo hosts -----------------------------------------------------------
// A script mounts by name: mount('chat', …) needs id="ed-chat" somewhere. Any
// script may mount editors, not only demos.ts.
const mounted = new Set()
for (const [file, source] of Object.entries(scripts)) {
  for (const match of source.matchAll(/\bmount\(['"]([\w-]+)['"]/g)) {
    mounted.add(match[1])
    const id = `ed-${match[1]}`
    if (declares(id)) continue
    problems.push(`${file}: mount('${match[1]}') · no id="${id}" in the markup`)
  }
}

// --- toolbar buttons ----------------------------------------------------------
// A button says which editor it drives; that editor has to be one that exists.
// The name may be interpolated, so a template expression is left alone.
for (const match of allMarkup.matchAll(/data-for="([\w-]+)"/g)) {
  if (mounted.has(match[1])) continue
  problems.push(`markup: data-for="${match[1]}" · no script mounts an editor by that name`)
}

// --- editable kits ------------------------------------------------------------
// `data-editable="prose"` names a kit that editable.ts has to define. A name
// nobody defined used to fall through to the single-line kit, which flattened
// every heading it was handed into body text — on every page but the home one,
// silently, for as long as nobody looked.
const kits = new Set()
for (const source of Object.values(scripts)) {
  const table = source.match(/const KITS[^=]*=\s*\{([^}]*)\}/)
  if (!table) continue
  for (const match of table[1].matchAll(/(\w+)\s*:/g)) kits.add(match[1])
}
if (kits.size > 0) {
  for (const match of allMarkup.matchAll(/data-editable="([\w-]+)"/g)) {
    if (kits.has(match[1])) continue
    problems.push(
      `markup: data-editable="${match[1]}" · no such kit (${[...kits].sort().join(', ')})`,
    )
  }
}

if (problems.length > 0) {
  console.error('site wiring is broken:\n')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(
  `site wiring ok · ${defined.size} ids, ${prefixes.length} templated, ` +
    `${mounted.size} editors, ${kits.size} kits`,
)
