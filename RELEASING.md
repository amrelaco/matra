# Releasing

One registry. Everything goes to public npm.

```sh
pnpm build && pnpm test && pnpm check && pnpm typecheck

cd packages/core && pnpm publish --access public
# wait for it to actually exist before publishing anything that depends on it
until [ "$(npm view @matrajs/core version)" = "1.2.3" ]; do sleep 20; done

for p in react vue ai collab versions; do (cd packages/$p && pnpm publish --access public); done
```

Dependants pin `@matrajs/core` by range, so core has to be *available* — not
merely accepted — before they go out. npm processes a publish asynchronously:
`+@matrajs/core@1.2.3` means accepted, not installable. Publishing dependants
against a queued core has produced uninstallable packages here once already.

Always `pnpm publish`, never `npm publish`: npm does not convert `workspace:*`
and will ship a manifest nobody can install.

## Why the paid packages are public too

They were nearly not. Three designs were built and discarded — a private npm
scope, GitHub Packages under a second organisation, a private repository
installed by git ref — before the obvious question got asked: what were they
protecting?

**The source is already public.** `packages/ai`, `packages/collab` and
`packages/versions` are in
this repository, and this repository is public. Anyone can read
`collab/src/collab.ts` in a browser, clone it, and build it. Every one of those
schemes guarded the npm door of a building with no walls, and each cost real
administration — an organisation to run, collaborators to add and remove, a
second repository to keep in step — to achieve nothing a determined non-payer
would even notice.

The alternative was making the repository private, which would trade the thing
that actually brings people in for a lock that a `git clone` opens.

So `@matrajs/ai`, `@matrajs/collab` and `@matrajs/versions` publish publicly,
and **the licence is
the boundary rather than the download**. That is the same arrangement as the
Business Source License and the Functional Source License: read it, build it,
run it in development, and pay when it goes to production beyond the free
threshold.

## What actually produces revenue

Not a gate. A company with a legal department does not put an unlicensed
dependency in its build to save $99 a month — it surfaces in acquisition due
diligence and in every enterprise security review, and the exposure is thousands
of times the saving. Individuals might, and the licence already gives
individuals these packages free.

What a subscription buys is the right to use them in production, plus updates
and support. See [SELLING.md](./SELLING.md).

## Versions

`ai` and `collab` were MIT through 0.5.0, and that grant cannot be withdrawn.
From 0.6.0 they carry the commercial licence. Nothing in either has ever checked
a licence at runtime, and nothing ever will: it would be patched out in an hour,
and until then it would sit in a customer's production waiting to fail.
