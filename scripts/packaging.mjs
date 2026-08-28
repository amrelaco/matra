#!/usr/bin/env node
/**
 * Load what we actually publish, both ways round.
 *
 * The test suite runs against `src` through a Vitest alias, so it proves the
 * source is right and nothing else. Everything between that and a user —
 * the `exports` map, the file list, the CJS build, whether the types are even
 * beside the code — is untested by construction, and it is exactly where a
 * package breaks: `require()` of an ESM-only build, an `exports` entry pointing
 * at a file `files` does not ship, a binding whose peer never resolves.
 *
 * So this imports every built package as ESM, requires it as CJS, and checks
 * that each path the manifest promises is a file that exists. It runs after the
 * build because there is nothing to load before it.
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGES = join(ROOT, 'packages')

const problems = []
const note = (name, message) => problems.push(`${name}: ${message}`)

/** Every path an installer could be pointed at by the manifest. */
function declaredPaths(pkg) {
  const paths = new Set()
  for (const key of ['main', 'module', 'types']) {
    if (typeof pkg[key] === 'string') paths.add(pkg[key])
  }
  const entry = pkg.exports?.['.']
  if (entry && typeof entry === 'object') {
    for (const value of Object.values(entry)) {
      if (typeof value === 'string') paths.add(value)
    }
  }
  return [...paths]
}

const names = (await readdir(PACKAGES, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

for (const dir of names) {
  const root = join(PACKAGES, dir)
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const name = pkg.name

  for (const declared of declaredPaths(pkg)) {
    const file = join(root, declared)
    const found = await stat(file).catch(() => null)
    if (!found?.isFile()) note(name, `${declared} is promised by package.json and is not there`)
  }

  // A scoped package is private unless something says otherwise, and finding
  // that out at publish time has cost a release before.
  if (pkg.publishConfig?.access !== 'public') {
    note(name, 'publishConfig.access is not "public", so a scoped publish would be restricted')
  }

  const esm = join(root, pkg.exports?.['.']?.import ?? pkg.module ?? 'dist/index.js')
  const cjs = join(root, pkg.exports?.['.']?.require ?? pkg.main ?? 'dist/index.cjs')

  let esmKeys = []
  try {
    const loaded = await import(pathToFileURL(esm).href)
    esmKeys = Object.keys(loaded).filter((key) => key !== 'default')
    if (esmKeys.length === 0) note(name, 'imports as ESM but exports nothing')
  } catch (error) {
    note(name, `does not import as ESM — ${String(error.message).split('\n')[0]}`)
  }

  try {
    const loaded = createRequire(join(root, 'noop.cjs'))(cjs)
    const cjsKeys = Object.keys(loaded).filter((key) => key !== 'default')
    if (cjsKeys.length === 0) note(name, 'requires as CJS but exports nothing')

    // The two builds are one library. A name in one and not the other is a
    // build that half worked, which is worse than one that failed.
    const missing = esmKeys.filter((key) => !cjsKeys.includes(key))
    if (esmKeys.length && missing.length) {
      note(name, `CJS is missing what ESM exports: ${missing.join(', ')}`)
    }
  } catch (error) {
    note(name, `does not require as CJS — ${String(error.message).split('\n')[0]}`)
  }

  if (!problems.some((problem) => problem.startsWith(`${name}:`))) {
    console.log(`  ok   ${name.padEnd(20)} ${esmKeys.length} exports, ESM and CJS`)
  }
}

if (problems.length) {
  console.error('\npackaging is broken:')
  for (const problem of problems) console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`\n${names.length} packages load as published`)
