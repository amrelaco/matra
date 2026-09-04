#!/usr/bin/env node
/**
 * The counts the site prints, produced rather than typed.
 *
 * The landing page said "439 tests" for three releases after the number
 * stopped being true, because a number typed into a page is a number nobody
 * is told to update. This writes `apps/site/src/data/facts.json` from the
 * test run and the built package, and `--check` refuses a committed file that
 * disagrees with either — the same arrangement `size.mjs` has with the bundle.
 *
 *   node scripts/facts.mjs                  run the suite, write the file
 *   node scripts/facts.mjs --check          fail if the file is stale
 *   node scripts/facts.mjs --from out.json  read a vitest JSON report instead of running
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'apps/site/src/data/facts.json')

const args = process.argv.slice(2)
const check = args.includes('--check')
const fromIndex = args.indexOf('--from')
const from = fromIndex === -1 ? null : args[fromIndex + 1]

/** Run vitest with the JSON reporter, or read a report somebody already wrote. */
function report() {
  if (from) return JSON.parse(readFileSync(from, 'utf8'))
  const dir = mkdtempSync(join(tmpdir(), 'matra-facts-'))
  const file = join(dir, 'vitest.json')
  const { status } = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--reporter=json', `--outputFile=${file}`],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] },
  )
  if (status !== 0) {
    console.error('facts: the test suite did not pass, so there is nothing to record')
    process.exit(1)
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  rmSync(dir, { recursive: true, force: true })
  return parsed
}

/**
 * How many extensions the core package exports.
 *
 * The same rule the site's wiring check applies: a plain definition, or a
 * factory known to return one. Read from the built package, because that is
 * what a user gets; skipped, with the old number kept, when there is no build.
 */
async function extensionCount(previous) {
  const dist = join(ROOT, 'packages/core/dist/index.js')
  if (!existsSync(dist)) return previous
  const core = await import(pathToFileURL(dist).href)
  const wiring = readFileSync(join(ROOT, 'scripts/wiring.mjs'), 'utf8')
  const factory = /const FACTORY =\s*\/(.+)\/\s*$/m.exec(wiring)
  const FACTORY = factory ? new RegExp(factory[1]) : /^$/
  const isDefinition = (value) =>
    value && typeof value === 'object' && 'kind' in value && 'name' in value
  return Object.entries(core).filter(
    ([name, value]) =>
      name !== 'core' &&
      (isDefinition(value) || (typeof value === 'function' && FACTORY.test(name))),
  ).length
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {}
const results = report()
const tests = results.numPassedTests + results.numFailedTests
const adversarial = results.testResults
  .filter((file) => /attack/.test(file.name))
  .reduce((sum, file) => sum + file.assertionResults.length, 0)
const extensions = await extensionCount(previous.extensions ?? 0)

const facts = { tests, adversarial, extensions }

if (check) {
  const stale = Object.entries(facts).filter(([key, value]) => previous[key] !== value)
  if (stale.length) {
    console.error('facts.json is stale:')
    for (const [key, value] of stale) console.error(`  ${key}: ${previous[key]} → ${value}`)
    console.error('Run `pnpm facts` and commit the result.')
    process.exit(1)
  }
  console.log(
    `facts.json is current · ${tests} tests, ${adversarial} adversarial, ${extensions} extensions`,
  )
} else {
  writeFileSync(OUT, `${JSON.stringify(facts, null, 2)}\n`)
  console.log(
    `wrote ${OUT} · ${tests} tests, ${adversarial} adversarial, ${extensions} extensions`,
  )
}
