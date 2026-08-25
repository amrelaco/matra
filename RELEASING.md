# Releasing

Two registries, because two of the packages are paid.

| Package | Registry | Access |
|---|---|---|
| `@matrajs/core`, `@matrajs/react`, `@matrajs/vue` | public npm | anyone |
| `@matrajs/ai`, `@matrajs/collab` | private git repo | subscribers only |

## The order matters

Dependants pin `@matrajs/core` by range, so core has to be *available* — not
merely accepted — before anything that depends on it is published. npm processes
a publish asynchronously: `+@matrajs/core@1.2.3` means accepted, not installable.
Publishing dependants against a queued core has already produced uninstallable
packages once.

```sh
pnpm build && pnpm test && pnpm check && pnpm typecheck

cd packages/core && pnpm publish --access public
# wait for it to actually exist
until [ "$(npm view @matrajs/core version)" = "1.2.3" ]; do sleep 20; done

for p in react vue; do (cd packages/$p && pnpm publish --access public); done
node scripts/release-pro.mjs --push                              # the paid two
```

Always `pnpm publish`, never `npm publish`: npm does not convert
`workspace:*` and will ship a manifest nobody can install.

## Where the paid packages live

They keep the `@matrajs` name, because the name belongs to the product and
Amrela is the company behind it rather than the thing being installed. That
rules out both of the obvious registries:

- **GitHub Packages** requires a package to be scoped to the account that owns
  it. The account is `amrelaco`, so it would only accept `@amrelaco/*`.
- **npm private packages** need a paid plan.

So they are not published to a registry at all. They live as built output in a
private repository, and npm installs them from a git ref:

```sh
npm i "@matrajs/ai@git+ssh://git@github.com/amrelaco/matra-pro.git#semver:^0.12.0"
```

Once installed it is `node_modules/@matrajs/ai`, and every import reads
`from '@matrajs/ai'` — the git URL appears once in a manifest and nowhere else.
`#semver:` resolves against the repo's tags, so ranges and upgrades work
normally.

Both manifests carry `"private": true`, which is npm's own guard, plus a
`prepublishOnly` hook that refuses with an explanation. The hook exists because
`private` is not exercised by `--dry-run` and therefore cannot be tested without
actually publishing — and an untested safety net is a belief rather than a
guard. The hook can be checked any time:

```sh
cd packages/ai && npm publish --dry-run   # should refuse, loudly
```

```sh
pnpm build
node scripts/release-pro.mjs          # dry run, prints what it would do
node scripts/release-pro.mjs --push   # copy dist, commit, tag
```

Built output only. Customers do not get a build toolchain, and a package that
compiles on install is a package that fails on somebody's CI.

### What this costs

An unusual install line, and the ref lands in the customer's lockfile. Both are
real. What it buys is the name, no new organisation, no monthly fee, and access
controlled by something already administered.

If a registry becomes worth its price later — a paid npm plan is about $7 a
month — moving is a change to the install line and nothing else, because the
package name never changes.

## Giving a customer access

1. Add them to the `matra-pro` repository with read access, as an outside
   collaborator or through a team. A GitHub account is all they need.
2. They install with their own credentials, so nothing secret is issued and
   nothing secret can leak into their lockfile.
3. For CI without SSH keys, an HTTPS remote and a token from the environment:

```sh
git+https://${GITHUB_TOKEN}@github.com/amrelaco/matra-pro.git#semver:^0.12.0
```

Removing their repository access removes future installs. Nothing checks a
licence at runtime, so whatever they already shipped keeps running — which is
what [the licence](./packages/ai/LICENSE) promises, and that promise is
load-bearing.

## Versions already public

`ai` and `collab` were MIT through 0.5.0 and public through 0.11.0. npm allows
unpublishing within 72 hours of a publish and refuses afterwards. Anything past
that window stays installable forever, so those versions are a permanent free
tier whether or not that was the intention — worth knowing before pricing
assumes otherwise.
