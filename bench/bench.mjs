import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
/**
 * Benchmarks, run against the built bundle rather than the source.
 *
 * Numbers here go on the website, so they are measured the way a user would
 * experience them: a real document, a real transaction stream, a real DOM.
 *
 *   node bench/bench.mjs            measure and print
 *   node bench/bench.mjs --check    fail if slower than bench/baseline.json
 *   node bench/bench.mjs --record   write bench/baseline.json
 */
import { Window } from 'happy-dom'

/*
 * Re-exec with --expose-gc rather than asking anyone to remember the flag.
 *
 * Without it `collect()` is a no-op, the numbers are 20 per cent wider, and
 * the gate below silently stops catching anything — a benchmark that quietly
 * degrades to useless when invoked the obvious way is worse than one that
 * refuses to run.
 */
if (!globalThis.gc) {
  const { status } = spawnSync(
    process.execPath,
    ['--expose-gc', new URL(import.meta.url).pathname, ...process.argv.slice(2)],
    { stdio: 'inherit' },
  )
  process.exit(status ?? 1)
}

const w = new Window({ url: 'https://bench.test' })
for (const k of [
  'window',
  'document',
  'Node',
  'Element',
  'DocumentFragment',
  'Text',
  'MutationObserver',
  'getSelection',
  'DOMParser',
  'HTMLElement',
]) {
  try {
    globalThis[k] = k === 'window' ? w : w[k]
  } catch {}
}

const { createEditor, starterKit } = await import('../packages/core/dist/index.js')

/*
 * Seven timed passes, and the fastest one wins.
 *
 * A mean is the wrong summary for this. The slow passes are the ones where the
 * scheduler took the core away or a GC landed mid-loop — noise added to the
 * work, never subtracted from it. The floor is the closest thing to the work
 * itself: on one idle laptop the mean keystroke ranged 0.035 to 0.108 ms
 * across three runs, a threefold spread, while the floor moved by a few
 * percent.
 */
const REPEATS = 7

/*
 * Collect before timing, never during.
 *
 * The largest single source of spread here was where garbage collection
 * happened to land. A pass that paid for a collection someone else's garbage
 * caused read 20 per cent slower than the identical code in the next pass,
 * which is wide enough to hide a real regression underneath it. Requires
 * --expose-gc; the script re-execs itself with it below.
 */
const collect = () => globalThis.gc?.()

const measure = (iterations, fn) => {
  fn()
  fn() // warm the JIT before measuring
  let best = Number.POSITIVE_INFINITY
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    collect()
    const started = performance.now()
    for (let i = 0; i < iterations; i++) fn()
    const each = (performance.now() - started) / iterations
    if (each < best) best = each
  }
  return best
}

/*
 * One unit of ordinary work, measured in this process, on this machine, in
 * this run.
 *
 * Absolute milliseconds cannot gate anything: a CI runner is a shared vCPU and
 * its numbers have nothing to do with a laptop's. Every result is divided by
 * this, so what is compared is "how many of these does a keystroke cost",
 * which is a property of the code rather than of the hardware under it.
 *
 * It allocates rather than spinning on arithmetic, because so does the editor.
 * A calibration made of pure numeric work would drift against the thing it is
 * meant to calibrate the moment allocation behaviour changed.
 */
const calibrate = () =>
  measure(200, () => {
    const rows = []
    for (let i = 0; i < 500; i++) rows.push({ type: 'p', n: i, text: `x${i}` })
    let sink = 0
    for (const row of rows) sink += row.text.length + row.n
    return sink
  })

const paragraphs = (n) => ({
  type: 'doc',
  content: Array.from({ length: n }, (_, i) => ({
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: `Paragraph ${i} with a reasonable amount of ordinary prose in it.`,
      },
    ],
  })),
})

/** Every figure, in calibration units. One full pass. */
function pass() {
  const calibration = calibrate()
  const out = {}
  const bench = (key, iterations, fn) => {
    out[key] = measure(iterations, fn) / calibration
  }

  const small = paragraphs(50)
  const large = paragraphs(2000)

  bench('create', 200, () => {
    createEditor({ extensions: starterKit, content: small })
  })
  bench('parseLarge', 20, () => {
    createEditor({ extensions: starterKit }).setContent(large)
  })

  const big = createEditor({ extensions: starterKit, content: large })
  bench('getHTML', 20, () => big.getHTML())
  bench('getJSON', 50, () => big.getJSON())
  bench('getText', 50, () => big.getText())

  const typing = createEditor({ extensions: starterKit, content: small })
  bench('insert', 2000, () => {
    typing.commands.select(1)
    typing.commands.insert('x')
  })

  const marking = createEditor({ extensions: starterKit, content: small })
  bench('mark', 2000, () => {
    marking.commands.select({ from: 1, to: 20 })
    marking.commands.toggleBold()
  })

  const el = w.document.createElement('div')
  w.document.body.appendChild(el)
  const mounted = createEditor({ extensions: starterKit, content: paragraphs(500) })
  mounted.mount(el)
  bench('keystroke', 500, () => {
    mounted.commands.select(1)
    mounted.commands.insert('a')
  })
  mounted.destroy()

  return out
}

/*
 * Three full passes, and again the floor of each figure.
 *
 * One pass is not enough even after REPEATS, because a whole pass can land in
 * a bad window: the first baseline here was recorded in a lucky run and every
 * check afterwards read 10 to 15 per cent slower, which is a gate that fails
 * on the weather. Both sides take the floor of five, so both are measuring the
 * same thing the same way.
 */
const PASSES = 3

function floors() {
  const best = pass()
  for (let i = 1; i < PASSES; i++) {
    const again = pass()
    for (const key of Object.keys(best)) best[key] = Math.min(best[key], again[key])
  }
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, Number(v.toFixed(3))]))
}

const LABELS = {
  create: 'create editor (50 paragraphs)',
  parseLarge: 'setContent JSON (2000 paragraphs)',
  getHTML: 'getHTML (2000 paragraphs)',
  getJSON: 'getJSON (2000 paragraphs)',
  getText: 'getText (2000 paragraphs)',
  insert: 'insert one character',
  mark: 'toggle bold over a range',
  keystroke: 'keystroke, mounted (500 paragraphs)',
}

const units = floors()
const baselinePath = new URL('./baseline.json', import.meta.url)
const record = process.argv.includes('--record')
const check = process.argv.includes('--check')

if (!check) {
  console.log('\n— units of calibrated work, lower is better —')
  for (const [key, value] of Object.entries(units)) {
    console.log(`${LABELS[key].padEnd(42)} ${value.toFixed(2).padStart(9)} u`)
  }
}

if (record) {
  writeFileSync(baselinePath, `${JSON.stringify({ units }, null, 2)}\n`)
  console.log(`\nrecorded ${Object.keys(units).length} figures to bench/baseline.json`)
}

/*
 * The ratchet.
 *
 * Performance is a promise this project makes on its landing page, so it is
 * checked here rather than discovered by a user. A regression past TOLERANCE
 * fails the build; a gain past IMPROVED is reported so it can be recorded and
 * held, but does not fail one — a build that breaks because the machine had a
 * good morning is a build nobody trusts, and an untrusted gate is worse than
 * no gate.
 *
 * 20 per cent is only usable because of the forced collection above. Without
 * it two identical runs differed by 26, which is not a threshold anybody can
 * set: dropping the perf primitive out of Fragment.replaceChild — a real
 * regression, introduced deliberately to test this — cost 26 per cent on the
 * keystroke and would have passed unnoticed under any tolerance wide enough
 * to keep CI green. With the collection forced, the same regression reads 43
 * and three consecutive clean runs land inside 6.
 *
 * The margin between those two numbers is the whole gate. It is set nearer
 * the noise than the regression because a CI runner is a shared vCPU and will
 * be less steady than the laptop these were taken on · if it turns out to
 * fire on a green build, widen it here rather than deleting the step.
 */
const TOLERANCE = 1.2
const IMPROVED = 0.9

if (check) {
  let baseline
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8')).units
  } catch {
    console.error('No bench/baseline.json. Run `node bench/bench.mjs --record` first.')
    process.exit(1)
  }

  const slower = []
  const faster = []
  const missing = []

  console.log('\n— against the baseline, in calibrated units —')
  for (const [key, now] of Object.entries(units)) {
    const then = baseline[key]
    if (then === undefined) {
      missing.push(key)
      continue
    }
    const ratio = now / then
    const verdict = ratio > TOLERANCE ? 'SLOWER' : ratio < IMPROVED ? 'faster' : 'ok'
    const delta = `${ratio > 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(0)}%`
    console.log(
      `${key.padEnd(12)} ${then.toFixed(2).padStart(9)} → ${now.toFixed(2).padStart(9)}  ` +
        `${delta.padStart(6)}  ${verdict}`,
    )
    if (ratio > TOLERANCE) slower.push(`${key}: ${then} → ${now} u`)
    if (ratio < IMPROVED) faster.push(`${key}: ${then} → ${now} u`)
  }

  // A figure the baseline has never seen is not a pass. It is a benchmark
  // somebody added without recording what it costs, and it gates nothing.
  if (missing.length) {
    console.error(`\nNot in the baseline: ${missing.join(', ')}`)
    console.error('Run `node bench/bench.mjs --record`.')
    process.exit(1)
  }
  if (faster.length) {
    console.log(`\nFaster than the baseline:\n  ${faster.join('\n  ')}`)
    console.log('Run `node bench/bench.mjs --record` to hold the gain.')
  }
  if (slower.length) {
    console.error(`\nSlower than the baseline:\n  ${slower.join('\n  ')}`)
    console.error('\nIf this is a deliberate trade, say so in the commit and re-record.')
    process.exit(1)
  }
  console.log('\nno regression')
}
