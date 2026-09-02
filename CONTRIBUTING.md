# Contributing

Thanks for looking. This is a small project with a strong opinion about its own
API, so the most useful thing you can send is usually a failing test.

## Getting set up

```bash
pnpm install
pnpm dev         # playground at localhost:5173
```

pnpm, not npm or yarn — the workspace uses `workspace:` protocol ranges and
`pnpm-workspace.yaml` carries the overrides. The version is pinned by
`packageManager`, so `corepack enable` is enough.

## Before you open a pull request

```bash
pnpm test        # vitest
pnpm typecheck   # tsc, including the type-level tests
pnpm check       # biome, and prettier for .astro
pnpm build       # tsup, all packages
```

CI runs those plus `pnpm size`, `pnpm bench:check`, `pnpm links`,
`pnpm wiring` and `pnpm packaging`. Running the first four locally catches
almost everything.

## What gets merged quickly

- **A failing test for a bug.** Even without a fix. A reproduction in
  `packages/core/src/*.test.ts` is worth more than a paragraph describing the
  problem, and it is the thing that stops the bug coming back.
- **A fix with the test that would have caught it.**
- **Documentation that corrects something wrong.** The site is Astro under
  `apps/site`; every docs page has an *Edit this page on GitHub* link.

## What to discuss first

- **A new extension in `packages/core`.** Everything in the box is in the
  bundle everyone downloads, so an extension has to earn its bytes. Open an
  issue and say who needs it.
- **Anything that changes a public signature.** The API is the product here.
- **A new runtime dependency.** There are none, in any package, and that is a
  deliberate constraint rather than an accident. A pull request that adds one
  will be asked what it would take to write instead.

## House rules

- **Conventional commits**, lowercase after the colon, saying what the change
  achieves rather than what was added. `fix(view): backspace at the start of a
  block` beats `fix: update view.ts`.
- **Biome** formats and lints. Do not add ESLint or Prettier config; `.astro`
  is the one exception and is already wired.
- **No `this`, no classes, no inheritance** in the public API. Extensions are
  plain objects and commands are plain functions — see
  [DESIGN.md](./DESIGN.md) for why.
- **No engine type in a public signature.** If a change would put one there,
  it needs a different shape.
- Tests live next to what they test, as `*.test.ts`. Type-level assertions go
  in `*.test-d.ts` or `*.type-test.ts` and run under `pnpm typecheck`.

## Security

Do not open a public issue for a vulnerability. [SECURITY.md](./SECURITY.md)
has the process. The rendering path is the gate that pasted HTML, document JSON
and collaborative steps all pass through, and reports about it are taken
seriously and answered.

## The paid packages

`packages/ai`, `packages/collab` and `packages/versions` are in this repository
and readable by anyone, but they are not MIT — see
[the licence](./packages/ai/LICENSE). Contributions to them are welcome on the
same terms as everything else, and the licence on them does not change what you
may do with your own contribution to the MIT packages.

## Licensing your contribution

By opening a pull request you agree that your contribution is licensed under
the licence of the package you changed: MIT for `core` and the four framework
bindings, the Matra Commercial License for `ai`, `collab` and `versions`.
