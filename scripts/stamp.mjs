#!/usr/bin/env node
/**
 * Stamp a customer's licence id into the paid packages, then pack them.
 *
 * This is not DRM and it does not run at the customer's end. Nothing here
 * checks anything, phones anywhere, or can fail in their production — the
 * licence promises exactly that, and the promise is worth more than the piracy
 * it fails to prevent.
 *
 * What it does is make a copy attributable. If a build turns up where it should
 * not be, the id says whose copy it was, which is what turns "we think they are
 * sharing it" into something you can actually raise.
 *
 *   node scripts/stamp.mjs acme-corp
 *   node scripts/stamp.mjs acme-corp --out ./dist-acme
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const PAID = ['ai', 'collab']
const root = resolve(import.meta.dirname, '..')

const [customer, ...rest] = process.argv.slice(2)
if (!customer || customer.startsWith('-')) {
  console.error('usage: node scripts/stamp.mjs <customer-id> [--out <dir>]')
  process.exit(1)
}
if (!/^[a-z0-9][a-z0-9-]{1,38}$/.test(customer)) {
  // The id ends up in a filename and in published bytes; keep it boring.
  console.error(`refusing "${customer}": use lowercase letters, digits and hyphens`)
  process.exit(1)
}

const outIndex = rest.indexOf('--out')
const outDir = resolve(root, outIndex === -1 ? 'stamped' : (rest[outIndex + 1] ?? 'stamped'))
mkdirSync(outDir, { recursive: true })

const issued = new Date().toISOString().slice(0, 10)
const stamped = []

for (const name of PAID) {
  const dir = join(root, 'packages', name)
  const manifestPath = join(dir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const original = readFileSync(manifestPath, 'utf8')

  // Recorded in the manifest rather than in the code: it survives bundling,
  // it is visible to anyone who looks, and it changes no behaviour at all.
  manifest.matra = { licensedTo: customer, issued }

  try {
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
    const output = execFileSync('npm', ['pack', '--pack-destination', outDir], {
      cwd: dir,
      encoding: 'utf8',
    })
    const tarball = output.trim().split('\n').pop()
    stamped.push(basename(tarball ?? ''))
  } finally {
    // Always put the manifest back, even if packing threw. A stamped manifest
    // committed by accident would ship one customer's id to everybody.
    writeFileSync(manifestPath, original)
  }
}

console.log(`stamped for ${customer} (${issued})`)
for (const file of stamped) console.log(`  ${join(outDir, file)}`)
console.log('\nSend these, or publish them to the private registry.')
console.log('The id is in package.json under "matra". Nothing reads it at runtime.')
