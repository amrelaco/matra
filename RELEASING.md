# Releasing

Two registries, because two of the packages are paid.

| Package | Registry | Access |
|---|---|---|
| `@matrajs/core`, `@matrajs/react`, `@matrajs/vue` | public npm | anyone |
| `@matrajs/ai`, `@matrajs/collab` | npm, **restricted** | subscribers only |

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
for p in ai collab; do (cd packages/$p && pnpm publish); done   # restricted
```

Always `pnpm publish`, never `npm publish`: npm does not convert
`workspace:*` and will ship a manifest nobody can install.

## Where the paid packages live

Free npm cannot host private packages, so `ai` and `collab` publish to **GitHub
Packages**, which hosts them free. Both keep the `@matrajs` name: GitHub
Packages requires a package to be scoped to the account that owns it, so this
needs a GitHub organisation called `matrajs` — free to create, and the name was
unclaimed as of this writing.

```sh
# one-time, by a human with the org
gh api -X POST /orgs --field login=matrajs      # or create it in the UI
gh repo create matrajs/packages --private       # anything; it owns the packages
```

Publishing needs a token with `write:packages` in `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

`publishConfig.registry` on those two packages points there, so `pnpm publish`
sends them to the right place without anyone having to remember.

**Until that org exists, both packages are public on npm and anyone can install
them.** `publishConfig.access` does not retroactively privatise: npm honours
access on a package's *first* publish and ignores it afterwards. Nothing about
the free packages changes — `core`, `react` and `vue` stay on public npm, which
is the point of them.

### If you would rather not create an org

Two alternatives, both free:

- **`@amrelaco` scope on GitHub Packages** — works today with the org you have,
  but the paid packages get renamed to `@amrelaco/matra-ai` and
  `@amrelaco/matra-collab`. Cheapest in effort, costs brand consistency.
- **A private repo and git installs** — `npm i git+ssh://git@github.com/amrelaco/matra-pro.git#v0.12.0`,
  with a deploy key per customer. No rename, uglier install line, and the ref
  ends up in their lockfile.

## Giving a customer access

1. Invite them to the `matrajs` org, or to a team with read access to the
   packages. A GitHub account is the only thing they need.
2. They create a personal access token with `read:packages` — theirs, not
   yours, so revoking their org access revokes the install.
3. They add two lines to `.npmrc`:

```
@matrajs:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

That second line redirects the **whole** `@matrajs` scope, because npm has no
per-package registry setting — only per-scope. So `@matrajs/core` would be
looked for on GitHub Packages too, and fail.

The fix is to mirror the free packages there as well: publish `core`, `react`
and `vue` to **both** registries, identical contents. Public npm stays the
source for everyone who is not a customer; GitHub Packages carries a copy so a
single `.npmrc` line resolves everything.

```sh
# after the public release, mirror the free three
for p in core react vue; do
  (cd packages/$p && pnpm publish --registry https://npm.pkg.github.com --access restricted)
done
```

The alternative — telling customers to add and remove a registry line depending
on which package they are installing — is the kind of instruction people follow
once and then file a bug about.

Nothing in the packages checks that token at runtime. It gates installing, not
running — which is what [the licence](./packages/ai/LICENSE) promises, and the
promise is load-bearing: a customer whose subscription lapses keeps shipping.

## Versions already public

`ai` and `collab` were MIT through 0.5.0 and public through 0.11.0. npm allows
unpublishing within 72 hours of a publish and refuses afterwards. Anything past
that window stays installable forever, so those versions are a permanent free
tier whether or not that was the intention — worth knowing before pricing
assumes otherwise.
