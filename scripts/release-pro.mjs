#!/usr/bin/env node
/**
 * Publish the paid packages to the private distribution repo.
 *
 * Not to a registry. `@matrajs/ai` cannot live on GitHub Packages, because that
 * requires the scope to match the owning account and the account is `amrelaco`;
 * and it cannot be private on npm without a paid plan. A private repo has
 * neither constraint: npm installs happily from a git ref, and the package is
 * still called `@matrajs/ai` once it lands in node_modules, which is the part
 * that shows up in everybody's imports.
 *
 *   node scripts/release-pro.mjs            # dry run, prints what it would do
 *   node scripts/release-pro.mjs --push     # commit and tag for real
 *
 * The distribution repo holds built output only — `dist/`, the manifest, the
 * README and the LICENCE. Customers do not get a build toolchain, and a package
 * that has to compile on install is a package that fails on somebody's CI.
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REPO = process.env.MATRA_PRO_REPO ?? 'git@github.com:amrelaco/matra-pro.git'
const PACKAGES = ['ai', 'collab']

const root = resolve(import.meta.dirname, '..')
const push = process.argv.includes('--push')
const work = join(root, '.matra-pro')

const version = JSON.parse(
  readFileSync(join(root, 'packages/core/package.json'), 'utf8'),
).version
const tag = `v${version}`

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()

for (const name of PACKAGES) {
  const dist = join(root, 'packages', name, 'dist')
  if (!existsSync(dist)) {
    console.error(`packages/${name}/dist is missing — run pnpm build first`)
    process.exit(1)
  }
}

if (!push) {
  console.log(`Would publish ${tag} to ${REPO}`)
  for (const name of PACKAGES) console.log(`  packages/${name} -> ${name}/`)
  console.log('\nRe-run with --push to do it.')
  process.exit(0)
}

rmSync(work, { recursive: true, force: true })
run('git', ['clone', '--depth', '1', REPO, work], root)

for (const name of PACKAGES) {
  const from = join(root, 'packages', name)
  const to = join(work, name)
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })

  cpSync(join(from, 'dist'), join(to, 'dist'), { recursive: true })
  for (const file of ['README.md', 'LICENSE']) {
    if (existsSync(join(from, file))) cpSync(join(from, file), join(to, file))
  }

  // The manifest ships without `private`, which exists in this repo only to
  // stop an accidental `npm publish`, and without devDependencies, which a
  // customer has no use for.
  const manifest = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8'))
  manifest.private = undefined
  manifest.devDependencies = undefined
  manifest.scripts = undefined
  writeFileSync(join(to, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

writeFileSync(
  join(work, 'README.md'),
  `# Matra Pro

Built releases of \`@matrajs/ai\` and \`@matrajs/collab\`, for people with a
subscription. Source lives in amrelaco/matra.

\`\`\`sh
npm i "@matrajs/ai@git+ssh://git@github.com/amrelaco/matra-pro.git#semver:^${version}"
\`\`\`

Licensed under the Matra Commercial License. Nothing here checks a licence at
runtime; access to this repository is the licence taking effect.
`,
)

run('git', ['add', '-A'], work)
const changed = run('git', ['status', '--porcelain'], work)
if (changed) {
  run('git', ['commit', '-m', `release ${tag}`], work)
} else {
  console.log('nothing changed')
}
run('git', ['tag', '-f', tag], work)
run('git', ['push', 'origin', 'HEAD'], work)
run('git', ['push', '-f', 'origin', tag], work)
rmSync(work, { recursive: true, force: true })

console.log(`published ${tag} to ${REPO}`)
