# Removing ProseMirror

Decision: Matra owns its engine. ProseMirror is being replaced layer by layer,
not ripped out — the public API leaks no engine type, so each layer can be
swapped without users noticing.

## Method

Strangler, not rewrite-in-a-branch. For every layer:

1. Write ours under `packages/core/src/engine/`.
2. Point the editor at it.
3. The existing suite must stay green — it is the contract.
4. Drop the ProseMirror package from `dependencies`.

A layer is only done when the dependency is gone from `package.json`.

## Phases

| Phase | Layer | Lines | gz | Status |
|---|---|---|---|---|
| 1 | keymap, input rules, history, list commands | ~1,700 | 21 kB | **done** |
| 2 | model — nodes, marks, fragments, schema, content expressions, DOM parse/serialize | ~3,500 | 29 kB | next |
| 3 | transform — steps, position mapping, rebasing | ~2,200 | 19 kB | |
| 4 | state — transactions, selection, plugins | ~1,000 | 9 kB | |
| 5 | view — contenteditable, IME, mutation observer, selection sync | ~6,000 | 59 kB | last |

## Where the risk actually is

**Phase 3 is the correctness risk.** Position mapping is what makes a late AI
edit land on the right words. A subtle bug there corrupts documents silently,
which is the exact failure Matra is sold against. It needs property-based tests:
invert-and-reapply round-trips, mapping associativity, and fuzzed step sequences
compared against a reference implementation.

**Phase 5 is the schedule risk.** `prosemirror-view` is ten years of
contenteditable work: IME composition for CJK input, Android GBoard's
after-the-fact corrections, spellcheck and autocorrect mutating the DOM behind
your back, selection sync, paste normalisation, and browser-specific bugs. The
code volume is not the problem; discovering the bugs is. Plan for a long tail
after "it works on my machine", and keep the ProseMirror view behind a flag
until ours has survived real users on iOS Safari and Android Chrome.

## Rules while this is in progress

- No ProseMirror type may enter a public signature. `types.ts` stays clean.
- Every phase keeps the full suite green; no phase lands with skipped tests.
- Bundle size is measured at each phase and recorded here, not estimated.
