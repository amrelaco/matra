/**
 * What each extension costs, measured one at a time.
 *
 * `size.mjs` measures a handful of named rungs, which answers "how big is the
 * starter kit". It cannot answer "how big is *my* array", and that is the
 * question the playground exists to let someone ask.
 *
 * So: a floor of document + paragraph + text, then the same bundle again with
 * one extension added. The difference is that extension's marginal cost, in
 * gzipped kilobytes, measured rather than guessed.
 *
 * Two honest caveats, both surfaced on the page rather than buried here:
 *
 *   - gzip is not additive. Two extensions that share code together cost less
 *     than the sum of their marginals, so a total built by adding these up is
 *     an upper bound, not a promise. TOTALS below measures a few real arrays
 *     so the page can say how far off the sum actually runs.
 *   - a marginal of 0.0 does not mean free. It means the extension is smaller
 *     than the rounding, which is the honest answer to "should I install only
 *     bold" and the whole point of the exercise.
 *
 * Reads dist, so run it after a build. Writes to the site's data directory.
 */
import { writeFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const OUT = 'apps/site/src/data/extension-sizes.json'
const CORE = "'./packages/core/dist/index.js'"

const FLOOR = ['document as doc', 'paragraph', 'text']
const FLOOR_USE = ['doc', 'paragraph', 'text']

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
    gzBytes: gzipSync(code).length,
  }
}

const bundleFor = (imports, used) => `
  import { createEditor, ${imports.join(', ')} } from ${CORE}
  export const editor = () => createEditor({ extensions: [${used.join(', ')}] })
`

/** Every extension the site's directory lists under @matrajs/core. */
const NAMES = process.argv.slice(2)
if (NAMES.length === 0) {
  console.error('Usage: node scripts/extension-sizes.mjs <name> [...]')
  process.exit(1)
}

const floor = await measure(bundleFor(FLOOR, FLOOR_USE))
console.log(`floor (document + paragraph + text)   ${floor.gz} kB gz\n`)

const extensions = []
const skipped = []

for (const name of NAMES) {
  if (FLOOR_USE.includes(name) || name === 'document') continue
  try {
    const one = await measure(bundleFor([...FLOOR, name], [...FLOOR_USE, name]))
    const marginalBytes = one.gzBytes - floor.gzBytes
    extensions.push({
      name,
      gz: Number((marginalBytes / 1024).toFixed(2)),
      bytes: marginalBytes,
    })
  } catch {
    // Not a value export, or not usable in an extensions array. Helpers and
    // types land here; they are listed on the page but are not extensions.
    skipped.push(name)
  }
}

extensions.sort((a, b) => b.bytes - a.bytes)

/**
 * Real arrays, measured whole, so the page can say how far the sum of the
 * marginals overshoots rather than pretending it does not.
 */
const TOTALS = [
  { id: 'marks-six', names: ['bold', 'italic', 'strike', 'code', 'underline', 'highlight'] },
  { id: 'writing', names: ['heading', 'bulletList', 'orderedList', 'listItem', 'blockquote'] },
]

const totals = []
for (const combo of TOTALS) {
  const whole = await measure(
    bundleFor([...FLOOR, ...combo.names], [...FLOOR_USE, ...combo.names]),
  )
  const measuredBytes = whole.gzBytes - floor.gzBytes
  const summedBytes = combo.names.reduce(
    (n, name) => n + (extensions.find((e) => e.name === name)?.bytes ?? 0),
    0,
  )
  totals.push({
    id: combo.id,
    count: combo.names.length,
    measured: Number((measuredBytes / 1024).toFixed(2)),
    summed: Number((summedBytes / 1024).toFixed(2)),
  })
}

const data = {
  floorGz: floor.gz,
  measured: new Date().toISOString().slice(0, 10),
  extensions,
  totals,
}

writeFileSync(OUT, `${JSON.stringify(data, null, 2)}\n`)

console.log(`measured ${extensions.length} extensions, skipped ${skipped.length}`)
if (skipped.length) console.log(`skipped: ${skipped.join(', ')}`)
console.log('\nlargest:')
for (const e of extensions.slice(0, 8)) console.log(`  ${e.name.padEnd(24)} ${e.gz} kB`)
console.log('\nsum vs measured:')
for (const t of totals) {
  console.log(
    `  ${t.id.padEnd(12)} ${t.count} exts · summed ${t.summed} kB · measured ${t.measured} kB`,
  )
}
console.log(`\nwrote ${OUT}`)
