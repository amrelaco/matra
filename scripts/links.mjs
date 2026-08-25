#!/usr/bin/env node
/**
 * Fail on any internal link with nothing behind it.
 *
 * The footer advertised six pages that did not exist for a while, and the docs
 * sidebar advertised a seventh. Both were found by a person rather than by a
 * check, which is the wrong way round.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = 'apps/site/dist'

const walk = (dir) =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    return statSync(full).isDirectory() ? walk(full) : [full]
  })

const all = walk(root)
const files = all.filter((file) => file.endsWith('.html'))

// Every built file is a valid target, not only the pages. Indexing HTML alone
// reported the favicon as a dead link on all twenty pages — the checker being
// wrong about the site rather than the site being wrong.
const pages = new Set(
  all.map((file) => {
    const path = relative(root, file)
      .replace(/index\.html$/, '')
      .replace(/\/$/, '')
    return path ? `/${path}` : '/'
  }),
)
pages.add('/404')

const dead = new Map()
for (const file of files) {
  const html = readFileSync(file, 'utf8')
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    if (/^(https?:|mailto:|data:|#)/.test(href)) continue
    const target = href.split('#')[0].split('?')[0].replace(/\/$/, '') || '/'
    if (!pages.has(target)) {
      dead.set(target, [...(dead.get(target) ?? []), relative(root, file)])
    }
  }
}

console.log(`${pages.size - 1} pages`)
if (dead.size === 0) {
  console.log('no dead internal links')
  process.exit(0)
}
console.error('\nDead links:')
for (const [target, sources] of dead) console.error(`  ${target}  <- ${sources.join(', ')}`)
process.exit(1)
