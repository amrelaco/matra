# Removing ProseMirror

Decision: Matra owns its engine. ProseMirror is being replaced layer by layer,
not ripped out — the public API leaks no engine type, so each layer can be
swapped without users noticing.

## Method

Phase 1 was a true strangler: keymap, input rules, history and list commands
each replaced a package and each dropped a dependency, with the suite green
throughout.

**Phases 2–5 cannot work that way.** The remaining packages are mutually coupled
through the document model:

    prosemirror-transform  →  prosemirror-model
    prosemirror-state      →  prosemirror-model, transform, view
    prosemirror-view       →  prosemirror-model, state, transform

PM's transform builds and consumes PM `Node` instances, so our model cannot be
handed to it. Model, transform, state and view therefore land together as a
parallel engine and flip in one cutover.

That means no dependency count moves until the whole thing is done, and the
cutover is the risky moment rather than a series of small ones. To keep it
honest:

1. Build the parallel engine under `packages/core/src/engine/`.
2. Test each layer directly, in isolation, as it is written.
3. Before the flip, run the entire existing suite against the new engine behind
   a switch — both engines pass, or the flip does not happen.
4. Keep the ProseMirror view available behind a flag until the new view has
   survived real users on iOS Safari and Android Chrome.

## Phases

| Phase | Layer | Lines | gz | Status |
|---|---|---|---|---|
| 1 | keymap, input rules, history, list commands | ~1,700 | 21 kB | **done** |
| 2 | model — nodes, marks, fragments, schema, content expressions, DOM parse/serialize | ~3,500 | 29 kB | **done** |
| 3 | transform — steps, position mapping, rebasing | ~2,200 | 19 kB | **done** |
| 4 | state — transactions, selection, plugins | ~1,000 | 9 kB | **done** |
| 5 | view — contenteditable, IME, selection sync | ~6,000 | 59 kB | **done** |

## Phase 2 notes

`engine/model/content-expression.ts` is done: a tokenizer and parser for the
content language (`paragraph block*`, `(text | image)+`, `heading{1,3}`), an NFA
compiler, and a subset construction to a DFA of `ContentMatch` states.

`fillBefore` is the piece worth pointing at. When a match cannot legally end, it
breadth-first searches for the shortest run of fillable types that would close
it — which is how the editor repairs a document instead of refusing an edit. A
type marked `fillable: false` is never used to repair, so a node that needs real
attributes is never invented out of nothing.

Written since: `mark.ts` (mark sets, rank ordering, exclusion), `fragment.ts`
(immutable runs, text joining, cutting, boundary-correct `findIndex`),
`node.ts` (sizes, classification, text extraction, descendant walking) and
`schema.ts` (NodeType, content compilation, `createAndFill`).

Two decisions worth remembering:

- **Text nodes are canonicalised on construction.** Adjacent text carrying
  identical marks is merged and empty text is dropped, so two documents that
  mean the same thing compare equal.
- **`createAndFill` returns null rather than guessing.** If closing a content
  gap would need a node whose attributes have no defaults, the caller is told
  the edit is impossible instead of receiving a malformed document.

Phase 2 is complete: `resolved-pos.ts` (ancestor chains, neighbours, marks at a
position, shared depth, block ranges) and the DOM layer.

Two behaviours in the DOM layer are deliberate and worth keeping:

- **An unrecognised element is transparent.** The parser descends into it rather
  than dropping it, so pasting from a word processor keeps the text instead of
  losing it to a `<div>` nobody wrote a rule for.
- **Loose inline content gets wrapped.** Pasting bare text produces inline nodes
  with no parent block; they are wrapped in the default textblock rather than
  discarded, because discarding them loses the paste.

Next: phase 3, transform — steps and position mapping.

## Phase 3 notes

`step-map.ts` is the crown jewel: flat `[start, oldSize, newSize]` triples, an
`assoc` argument deciding which side of an insertion point a position lands on,
and `deleted` reporting when a position was inside a span that no longer exists.

It is fuzzed, not just sampled — 500 deterministic seeds asserting that mapping
never moves a position backwards past an earlier one, that inverting returns
every position outside a change exactly, and that a chain of maps equals
applying them one at a time.

**A property the fuzz forced us to state honestly:** a deletion collapses both
edges of its span onto one point. Deleting `[5,6)` sends both 5 and 6 to 5, and
inverting cannot know which it came from — that information is genuinely gone.
Round-trip is exact only for positions strictly outside the changed span; on the
boundary, `assoc` picks a side. The first version of the test asserted a
stronger property than reality allows and had to be corrected, not the code.

`step.ts` covers replace, addMark and removeMark, each able to invert itself.
The replacement planner handles all four shapes a cross-block range can take —
both ends inside blocks (the blocks join, which is what backspace at a boundary
means), one end inside, or both on boundaries. Anything deeper than one level
of nesting returns null so the step fails loudly rather than producing a
malformed document.

Rebasing is done. `Step.map` moves a step over changes made underneath it and
returns null when there is nothing left to act on. One rule there is worth
keeping: a step that meant *replace this text* whose text has since been
deleted must not degrade into *insert this text here*. Without that check, a
rebased AI rewrite pastes itself into a paragraph the user already deleted.

## Phase 4 notes

`selection.ts`, `transaction.ts`, `state.ts` and `plugin.ts`.

- Selections snap to positions text can actually occupy, so nothing downstream
  has to re-check. A NodeSelection whose node is deleted degrades to a caret
  rather than pointing at nothing.
- A transaction remaps its own selection after every step, so the caret stays
  where the user would expect as the document moves under it.
- Setting the selection clears stored marks: typing after moving the caret
  should not inherit bold from somewhere else.
- `state.apply` returns *the same state object* when a plugin vetoes, so callers
  can compare by identity to know whether anything happened.

## Phase 5 notes — and the cutover

The view is built on `beforeinput` rather than mutation reconciliation. The
browser announces what it is about to do, the view cancels it, applies the
equivalent change to the model, and re-renders. The DOM is therefore a
projection of the document rather than a second source of truth that has to be
diffed back.

Composition is the deliberate exception. While an IME candidate window is open
the browser is left completely alone — cancelling input mid-composition breaks
Japanese, Chinese and Korean entry outright — and the affected content is read
back when composition ends.

**One behavioural difference from ProseMirror:** the view takes over the element
it is given rather than creating a child. `editor.mount(el)` makes `el` itself
the editable surface.

### Cutover, done

    dependencies: {}

All four ProseMirror packages are gone and the entire suite passes on our
engine: 178 tests, unchanged in intent from when they ran against ProseMirror.
That was the contract, and it held.

Measured at the cutover:

| | before | after |
|---|---|---|
| runtime dependencies | 9 | **0** |
| `@matrajs/core` gzipped | 5.9 kB | 25.9 kB |
| full app bundle gzipped | 66.4 kB | **18.4 kB** |

The core package grew because the engine is now inside it. What matters to a
user is the last row: an app ships a fraction of what it did, because nothing
is pulled in that the editor does not use.

Extensions have landed since, so that last number is not today's. The current
figure is whatever `pnpm size` prints — **25 kB** for the starter kit as of
0.16 — and it is checked in CI rather than quoted from here.

## What typing costs

A keystroke is the operation everything else is measured against, and it took
three rounds of profiling to stop it costing the length of the document. The
current shape, and why each piece is that shape:

- **The document is rebuilt around one child, not by cutting.** An edit inside a
  paragraph rebuilds every ancestor between it and the root. Doing that by
  cutting the ancestor's children in two and appending the replacement back into
  the middle walks the whole run three times and re-adds every child's size to
  reach a total that differs from the old one by exactly one child.
  `Fragment.replaceChild` copies the array once and does the size arithmetic in
  a subtraction. Text is the exception — text nodes merge with their neighbours,
  so the canonical form still has to be rebuilt when either side is text.
- **The diff asks before it touches the DOM.** `childNodes` is a live list, and
  the patch loop used to index it for every child before deciding whether that
  child was inside the edit at all. On two thousand blocks, 1999 of those reads
  were thrown away.
- **The position map reuses its entries.** Re-recording is what a patch does to
  every node whose subtree it kept, and a fresh entry object per node per edit is
  garbage generated to say what the old object already said.
- **A full position-map backlog drops the backlog, not the document.** The map
  absorbs each edit's mapping rather than rewriting every entry, and replays the
  backlog when a cold entry is read. Past sixty-four pending edits the replay
  costs more than saying where everything is again — which used to mean
  rebuilding the whole document's DOM, at the cost of a rebuild every
  sixty-fourth keystroke and the silent loss of every mounted node view's state.
  The re-record happens after the patch, because before it the positions are
  still in the coordinates the edit moved away from.

Measured in Node against happy-dom, that takes a keystroke on a
2000-paragraph document from 0.464 ms to 0.062 ms, and stops it tracking the
document's length: 0.045 ms at 20 blocks against 0.062 ms at 2000. In a browser
it is what put Matra ahead of Lexical on the row it used to lose.

The first render is a different problem with a different answer. It is within
about 15% of the floor — the cost of the browser creating the same elements with
no editor involved — so there is very little of it that is ours to remove. What
was ours: building into a document fragment and attaching it once rather than
appending block by block into a live tree, skipping the mark stack for children
that have no marks, and taking a direct path for the `[tag, 0]` shape most nodes
render as. Together, 0.77 ms to 0.59 ms for two hundred blocks in Node.

## What is deliberately not built yet

Honesty about the gaps, since "no dependencies" can read as "complete":

- ~~**Collaborative editing.**~~ Done in `@matrajs/collab`: an authority, step
  exchange, rebasing of unsent work over remote edits, and remote cursors drawn
  as decorations, each one mapped through local steps rather than clamped.
- ~~**Node views.**~~ Done. A node type may declare `nodeView`, returning its
  own DOM plus an optional `contentDOM` for children. `stopEvent` keeps the
  editor's hands off interactions inside the view.

  Node views forced a real fix underneath: the renderer used to call
  `replaceChildren()` on every keystroke, which is O(document) per character and
  would have destroyed a view's focus, scroll position and any half-finished
  interaction. It now patches. Because nodes are immutable, an edit inside one
  paragraph leaves every other paragraph as literally the same object, so
  identity alone skips most of the tree. Inline content inside a textblock is
  still rebuilt whole — it is small, and mark wrappers make its DOM shape
  diverge from the fragment.
- **Decorations.** No inline highlights or widgets independent of the document.
- **Drag and drop**, and **tables**.
- **Deep nesting in replace.** A cross-block range nested more than one level
  deep returns null rather than guessing; it fails loudly, but it fails.

## Where the risk actually is

**Phase 3 is the correctness risk.** Position mapping is what makes a late AI
edit land on the right words. A subtle bug there corrupts documents silently,
which is the exact failure Matra is sold against. It needs property-based tests:
invert-and-reapply round-trips, mapping associativity, and fuzzed step sequences
compared against a reference implementation.

**Phase 5 remains the schedule risk, and shipping it does not end that.** The
view passes its tests in happy-dom, which is not a browser. IME composition for
CJK input, Android GBoard's after-the-fact corrections, spellcheck and
autocorrect mutating the DOM, and browser-specific selection bugs are found by
real users on real devices, not by unit tests. Treat the current view as
working-but-unproven until it has survived iOS Safari and Android Chrome, and
expect a tail of fixes there rather than a clean finish.

`harness/ime` is where that gets checked: a page to open on a real phone that
watches the document and the screen for the moment they disagree, logs the
composition events the browser actually sent, and walks a checklist of the cases
that break editors. Deliberately manual — the value is in the keyboards a device
farm does not have installed.

## Rules while this is in progress

- No ProseMirror type may enter a public signature. `types.ts` stays clean.
- Every phase keeps the full suite green; no phase lands with skipped tests.
- Bundle size is measured at each phase and recorded here, not estimated.
