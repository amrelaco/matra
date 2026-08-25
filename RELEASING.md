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

## Why the paid packages are marked restricted

`publishConfig.access` is `restricted` on `ai` and `collab`. It used to be
`public`, which is how every version of both ended up freely installable while
the pricing page sold them. A subscription anyone can skip is a donation.

**This setting alone does not close the gate.** npm honours `access` on a
package's *first* publish and ignores it afterwards, so
`@matrajs/ai` and `@matrajs/collab` are public today and stay public until
somebody runs:

```sh
npm access set status=private @matrajs/ai
npm access set status=private @matrajs/collab
npm access get status @matrajs/ai      # verify: should say private
```

That needs the `@matrajs` org on a paid npm plan — private packages are not on
the free tier. Until it is run, the config change only prevents the *next new*
package from going public by accident. It is a seatbelt, not a lock.

Do not "fix" a failing restricted publish by setting access back to public.

## Giving a customer access

1. npm → Access Tokens → **Granular access token**, read-only, scoped to
   `@matrajs/ai` and `@matrajs/collab`, with an expiry.
2. Name it after the customer, so it can be revoked when they leave.
3. They add it to their `.npmrc`:

```
//registry.npmjs.org/:_authToken=${MATRA_TOKEN}
```

Nothing in the packages checks that token at runtime. It gates installing, not
running — which is what [the licence](./packages/ai/LICENSE) promises, and the
promise is load-bearing: a customer whose subscription lapses keeps shipping.

## Versions already public

`ai` and `collab` were MIT through 0.5.0 and public through 0.11.0. npm allows
unpublishing within 72 hours of a publish and refuses afterwards. Anything past
that window stays installable forever, so those versions are a permanent free
tier whether or not that was the intention — worth knowing before pricing
assumes otherwise.
