# Changelog

All eight packages share one version number and are released together.

The repository carries no git tags, and only three release commits, so version
boundaries below `0.15.0` are not recoverable exactly. Those releases are
grouped and dated from the history rather than invented — where a date matters
legally, the licence boundary at `0.6.0`, it is stated on its own.

## 0.16.0 — 2026-08-28

- **`getHTML()` answers without a DOM.** Serialising a document on a server no
  longer needs a polyfill, which puts it alongside `toMarkdown` as something
  that runs in Node, in a worker and at the edge.
- The server path and the published packages are covered by tests, after
  `0.14.0` shipped from an earlier state of the source and the npm copy was
  missing `isActive` and `can`.
- Bindings are tested in CI at both edges of every peer range, so a Vue 3.4 and
  a Vue 3.5 user are both covered by something other than optimism.
- A page under `harness/ime` for checking composition on a real device.

## 0.15.0 — 2026-08-28

- **Node and mark names are typed from the extension array.** `isActive('bold')`
  is checked against what you actually passed, so a renamed or absent extension
  is a compile error rather than a button that silently never lights up.
- **`editor.can`** — every command, asking instead of doing. A toolbar button
  can be disabled rather than enabled-and-inert.
- **A performance ratchet.** `pnpm bench:check` measures against a recorded
  baseline and fails CI on a regression, on a harness steady enough to mean it.
- `pnpm size` refuses to measure a bundle older than its source.
- Loading a document starts its history there, so the first undo cannot empty
  the editor.
- A node declares which marks it accepts, and the schema now asks.
- Documentation: the packages, sizes and snippets describe what actually ships.

## 0.6.0 – 0.14.0 — 2026-08-25 to 2026-08-27

**The licence split happened at `0.6.0`.** `@matrajs/ai`, `@matrajs/collab` and
`@matrajs/versions` carry the [Matra Commercial License](./packages/ai/LICENSE)
from this version onward. Everything through `0.5.0` was MIT, including `ai` and
`collab`, and **that grant cannot be withdrawn** — anyone already on `0.5.0` may
stay there under MIT forever.

- **`@matrajs/svelte` and `@matrajs/solid`**, so every framework has a
  first-class binding rather than a community one.
- **`@matrajs/versions`** — snapshots, a real block-and-word diff between them,
  and restore as one undo step.
- **Drag and drop**, with the block handle Tiptap charges for: a line shows
  where the block will land, and the move is one undo step.
- **Task lists, typography, table of contents, unique ids and Markdown** — the
  last of these as pure string work, so it needs no DOM.
- **Mentions and slash commands**, detection only · the popup stays yours.
- Typing stopped costing the size of the document, twice: the view diff was
  narrowed to the region an edit touched, and IME users stopped paying for the
  whole document on every character.
- Distribution settled: three schemes for gating the paid packages were built
  and discarded before the obvious question got asked. The source is public, so
  the licence is the boundary rather than the download.
- The site was rebuilt around the idea that the page is the product — every
  text on it is a live editor.

## 0.2.0 – 0.5.0 — 2026-08-24

- **Comments, collaborative editing and remote cursors.**
- **Node views and a renderer that patches instead of rebuilding**, plus
  decorations.
- **Thirteen security holes closed by attacking the rendering gate**, eight in
  one pass and five more in a second. Document JSON, pasted HTML and
  collaborative steps are all treated as hostile.
- Vue bindings and the full extension set.

## 0.1.0 — 2026-08-23/24

The engine, written from scratch and taken off ProseMirror entirely.

- Document model, content expression parser, resolved positions and the DOM
  layer.
- Position mapping, steps and transforms · rebasing, selections, transactions
  and plugins.
- Keymap, input rules, history and list commands.
- `@matrajs/core` with inferred command types, `@matrajs/react`, `@matrajs/ai`,
  and the starter kit.
- **Zero runtime dependencies**, which has held since.

Published under the `@matrajs` scope from the start · the `@matra` scope
belongs to an unrelated project.
