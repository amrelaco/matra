# Changelog

All packages share one version number and are released together.

## 1.0.0 — 2026-09-04

The engine got faster everywhere it was measured, thirty-six extensions
arrived, the documentation gained a server any AI tool can read it through,
and every package is now installed with plain npm into a fresh app for each
framework and built there before it ships.

**Faster.** Typing at the end of a long document cost twelve times what
typing at the top did, because every position was found by walking the
document from its first block; it is found by bisection now, and the two are
the same. Marking a word rebuilt the whole document; it rebuilds the block.
`toDOM` was handed a JSON serialisation of the node, and its children, and
their children, so that it could read one attribute; it gets a lazy view.
`isActive` started a transaction to read the state. The character counter
serialised the document on every click. The drag handle measured every block
on every mouse move. The undo history copied itself to add a keystroke. The
browser selection was rewritten to where it already was on every keystroke.
Decorations threw the narrowed redraw away. Each of these is in
BENCHMARKS.md with a number beside it; in the ratchet's units a character
insert went from 2.73 to 0.22, a mark from 4.46 to 0.26, `getHTML` from 89.6
to 30.3, and creating an editor from 17.5 to 3.7.

**Fixed.** `commands.insert` left the caret one position past its own text,
because the selection was mapped through the change twice. Changing a node's
attributes — aligning a paragraph, ticking a task — was a replacement of the
node, so every position inside it, the caret included, was mapped to its end;
it is its own kind of step now, and nothing inside the node moves. Pasting a
table, a list or two paragraphs into the middle of a paragraph threw, because
a block cannot go inside a paragraph; the paragraph is split around blocks,
and pasted paragraphs join the halves so two paragraphs pasted into a third
make three. Three lines of plain text pasted from a text file became one
paragraph with the breaks collapsed to spaces; they are three paragraphs, and
inside a code block the line breaks stay put. A mention's label was passed to
the renderer as a tag name — `createElement('@Nahim')` — which a real browser
refuses. `insertHorizontalRule` and the `---` shortcut were refused with the
caret inside a paragraph. Code blocks loaded from HTML lost their line breaks.
`textAlign` did nothing on the stock paragraph. A node decoration that moved
on stayed on the element it left. Something dropped from outside the editor
was written into the DOM behind the document's back. A selection dragged
leftwards was written to the browser the right way round. The undo entry
order under a burst of typing is pinned by a test. The site's directory
promised commands that did not exist; the rows now say what the editor has.

**New extensions**, all MIT, all in `@matrajs/core`, none in the bundle until
it is in the array:

- `textStyle` — colour, background, font family and size, as one mark.
- `search()` — find and replace, incremental: typing rescans one paragraph.
- `autolink()` — URLs become links as they are typed and pasted.
- `detailsKit` — a collapsible toggle, rendered as a real `<details>`.
- `callout` — a Notion-style callout with a type and an emoji.
- `emoji()` — `:tada:` as you type, and a table for a picker.
- `clearFormatting` — every mark off, every block a paragraph, one undo step.
- `focus()` — a class on the block the caret is in.
- `trailingNode()` — always a paragraph after whatever ends the document.
- `youtube` — an embed built from the video id on the privacy domain.
- `embed()` — any embed page in a sandboxed frame, from an allowlist of hosts.
- `codeHighlight()` — syntax highlighting as decorations, with a built-in
  tokeniser or yours.
- `indent()` — Tab and Shift-Tab on paragraphs and headings.
- `fileHandler()` — files dropped or pasted, with a marker that keeps the
  drop position right while the upload runs.
- `imageResize()` — a drag handle on every image, and a `width` the HTML keeps.
- `locked()` — blocks that refuse every change: a keystroke, a paste, a drop, a
  drag and a command alike. A template with fixed clauses.
- `field` — a blank in a template, filled in the editor with `fillFields` or
  in JSON on a server with `fillFieldsIn`. A mail merge with no editor.
- `snippets()` — words that expand as they are typed, into text, nodes or
  whole blocks.
- `columnsKit` — two to six columns, and back to blocks without losing anything.
- `pageBreak` — a labelled line on screen, a real page break in print.
- `lineHeight()` — line height on a block, as a checked style.
- `textDirection()` — `dir` on a block, and right-to-left detected from the text
  when it is unset.
- `footnotesKit()` — a marker in the text and a note at the end, numbered by
  position as decorations, so moving a paragraph renumbers everything.
- `mathKit()` — inline and display formulas; KaTeX or MathJax plug in, and
  without them the source shows.
- `textTransform` — upper, lower, title and sentence case on the selection or
  the word under the caret, keeping every mark.
- `invisibleCharacters()` — a dot on every space, a pilcrow on every block,
  drawn and never stored.
- `selectionHighlight()` — every other occurrence of the selected word.
- `typewriter()` — the line being written stays put; the page moves under it.
- `autosave()` — saves once typing pauses, and before the page goes away.
- `smartPaste()` — tab-separated text becomes a table, Markdown becomes blocks.
- `hashtag()` — a tag as a node, listable from the JSON with `hashtagsIn`.
- `kbd` — a key name, as `<kbd>`.
- `bubbleMenu()` and `floatingMenu()` — your element, shown over the selection
  or on an empty line.
- `ghostText()` — inline completion from any source: grey text after the caret,
  Tab to take it, a word at a time if you like.
- `dictation()` — speak, and the words arrive at the caret, through the
  browser's own recogniser.
- Tables: `addRowBefore`, `addRowAfter`, `deleteRow`, `addColumnBefore`,
  `addColumnAfter`, `deleteColumn`, `toggleHeaderRow`, `goToNextCell`,
  `goToPreviousCell`, and Tab between cells. A cell that spans the boundary a
  new row or column crosses is widened rather than split.

**New in the extension API.** `attributes` on an extension adds attributes to
nodes and marks defined elsewhere, rendered onto the element and read back on
parse. `handlePaste(ctx, data)` and `handleDrop(ctx, data)` let an extension
claim a paste or a drop before the editor parses it. `filterChange(ctx)` lets
an extension veto a change before it lands, and `editor.can` asks it too.
`nodeViews` on an extension renders nodes defined elsewhere. `code: true` on a
node keeps whitespace literal inside it. `ctx.insert` and `ctx.replace` accept
blocks at a caret inside a paragraph. A command whose change a filter refused
returns false.

**`@matrajs/mcp`** — a Model Context Protocol server, zero dependencies,
that serves this documentation to any AI tool that speaks MCP over stdio or
HTTP. `npx @matrajs/mcp` and point Claude, Cursor or Codex at it.

**Bundle.** The starter kit is 30 kB gzipped, from 25. The budget in
`scripts/size.mjs` is 30, and the comment there says what the bytes bought.
Seventy-nine extensions ship in the package; the bundle carries the ones in
the array.

**Checked before release.** `pnpm install:matrix` packs every package, installs
it with plain npm into a fresh React, Vue, Svelte, Solid and vanilla Vite app,
builds each and runs the built app in a DOM. `pnpm facts` writes the counts
the site prints, so a number on the landing page is one a script produced.

**Docs.** The engine is called the Matra engine. Every extension has a
step-by-step recipe on the site, the README says what an extension may
declare, and `editor.can` is documented beside every command it answers for.

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
- **`versionList` accepts a real editor.** Its parameter had been typed so that
  nothing satisfied it, and every caller had to cast.
- The commercial licence names every MIT binding. It had listed `core`, `react`
  and `vue` and omitted `svelte` and `solid`, contradicting the README.
- Documentation: a page each for AI, collaboration and version history; every
  package covered in detail in the README; and the fact that loading an HTML
  string needs a DOM while JSON does not, which the tests asserted and nothing
  said out loud.

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
