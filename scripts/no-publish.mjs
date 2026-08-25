#!/usr/bin/env node
/**
 * Refuse to publish a paid package to a public registry.
 *
 * `"private": true` is npm's own guard and is the real one — but it is not
 * exercised by `--dry-run`, so it cannot be tested without actually publishing,
 * and an untested safety net is a belief rather than a guard. This one runs
 * from `prepublishOnly` and can be checked any time.
 *
 * These packages are distributed by scripts/release-pro.mjs, into a private
 * repository. See RELEASING.md.
 */
const name = process.env.npm_package_name ?? 'this package'

console.error(`
Refusing to publish ${name}.

It is a paid package and does not go to a public registry. Releases are built
and pushed to the private distribution repo:

    pnpm build
    node scripts/release-pro.mjs --push

If you genuinely mean to publish it publicly, remove "private" and this
prepublishOnly hook first — deliberately, in a commit someone can review.
`)
process.exit(1)
