# Releasing

Two registries, because two of the packages are paid.

| Package | Registry | Access |
|---|---|---|
| `@matrajs/core`, `@matrajs/react`, `@matrajs/vue` | public npm | anyone |
| `@amrelaco/matra-ai`, `@amrelaco/matra-collab` | GitHub Packages | subscribers only |

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
for p in ai collab; do (cd packages/$p && pnpm publish); done   # GitHub Packages
```

Always `pnpm publish`, never `npm publish`: npm does not convert
`workspace:*` and will ship a manifest nobody can install.

## Where the paid packages live

Free npm cannot host private packages, so the paid two publish to **GitHub
Packages**, which hosts them free under the `amrelaco` organisation that already
exists. GitHub Packages requires a package to be scoped to the account that owns
it, which is why they are `@amrelaco/matra-ai` and `@amrelaco/matra-collab`
rather than `@matrajs/*`.

The split is worth having rather than merely tolerated. npm resolves registries
per **scope**, never per package. Had the paid packages stayed in `@matrajs`,
pointing that scope at GitHub Packages would have sent `@matrajs/core` there too
and broken it — which would have meant mirroring the free packages to both
registries forever. Two scopes means one line of configuration that touches only
the paid packages, and the free ones resolve from public npm with no
configuration at all.

| Package | Registry |
|---|---|
| `@matrajs/core`, `@matrajs/react`, `@matrajs/vue` | public npm |
| `@amrelaco/matra-ai`, `@amrelaco/matra-collab` | GitHub Packages, private |

Publishing needs a token with `write:packages` in `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

`publishConfig.registry` on those two points there, so `pnpm publish` sends them
to the right place without anyone having to remember which is which.

## Giving a customer access

1. Invite them to the `amrelaco` organisation, or to a team with read access to
   the two packages. A GitHub account is all they need.
2. They create a personal access token with `read:packages` — theirs, not yours,
   so removing their access removes the install.
3. They add two lines to `.npmrc`:

```
@amrelaco:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

That redirects only the `@amrelaco` scope. `@matrajs/core` and the bindings keep
resolving from public npm, so the rest of a customer's install works with or
without the token — it matters only for the packages they are paying for.

Nothing in those packages checks the token at runtime. It gates installing, not
running, which is what [the licence](./packages/ai/LICENSE) promises — and that
promise is load-bearing: a customer whose subscription lapses keeps shipping.

## Versions already public

`ai` and `collab` were MIT through 0.5.0 and public through 0.11.0. npm allows
unpublishing within 72 hours of a publish and refuses afterwards. Anything past
that window stays installable forever, so those versions are a permanent free
tier whether or not that was the intention — worth knowing before pricing
assumes otherwise.
