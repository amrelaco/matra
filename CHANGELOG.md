# Changelog

All packages share one version number and are released together.

## 1.1.1 — 2026-09-08

**`blockColor` · colour on the block, the way Notion means it.** `textStyle`
already colours text, and a mark is the right model for three words in a
sentence and the wrong one for a paragraph: mark every character and the
background still stops at the last one, then comes apart when somebody types at
the end. This is an attribute on the block instead, so the colour spans the
measure, travels with the block when it is dragged, and stays on an empty
paragraph — none of which a mark can do. `setBlockColor`, `setBlockBackground`,
their unsets and `unsetBlockColors`; the block types are yours to pass, and so
is the palette, because a headless editor that picks your ten colours has
picked your design. 0.37 kB gzipped, measured.

**Global attributes that render a style no longer overwrite each other.** The
composition rule was applied when a global met the node's own attributes and
not when it met another global, so of `textAlign`, `lineHeight` and `indent`
only the last to run reached the HTML. Centring a paragraph and then setting
its line height silently dropped the centring — and since that HTML is what
gets stored and parsed back, it was data leaving the document rather than a
rendering quirk. Found while adding a fourth extension that renders a style.

**A slash menu and an @ menu can finally sit on one editor.** `suggestion`
documented that two of them need two names, and two of them did work — separate
state, separate decorations. The pair of commands they declared did not:
`acceptSuggestion` and `cancelSuggestion` were literals whatever the name was,
so the second instance tripped the "two extensions both define the command"
guard and the editor refused to build. The only way to have both was to strip
the commands off one of them. The names are derived from the extension's name
now — `suggestion({ char: '/', name: 'slash' })` brings `acceptSlash` and
`cancelSlash`, and the default name yields exactly the two names it always did,
so nothing that worked before reads differently. The types follow, so
`editor.commands.cancelSlash` is known rather than guessed.

**`colorOf` is exported, and is now the only thing that decides what a colour
is.** The check had been copied into a second extension and a third was about
to copy it again; a security-critical pattern maintained in three places is one
that gets corrected in one of them.


**The drag handle is a drawn grip, aligned to the top of the first line.** It
was the braille character `⠿` at 14px, so its weight and size were whatever the
reader's font did with it — faint on most, a tofu box on a machine without the
glyph. Six dots in a CSS grid are the same shape everywhere and can be sized to
the hand rather than to a font. Its colour is `var(--matra-drag-handle,
currentColor)`, so a host can set one without restyling the element.

It also sat against the top of the whole *block*, which read as aligned on a
paragraph and visibly high on a heading. It now measures the first line box and
sits at the top of that.

**The drag handle stays put while you reach for it.** It lives outside the
editable element, so a pointer travelling from the words to the grip fires
`mouseleave` on the way. The guard for that compared `relatedTarget` to the
handle by identity, which stopped working the moment the handle grew a child —
and even fixed, the gap between the text and the grip belongs to neither, so
the pointer is over nothing at all while it crosses. The check uses `contains`
now, the handle pads out to the block's edge so the gap is part of its target,
and a 240ms grace period covers the rest.

**A drag carries the block, not the grip.** The browser builds its drag image
from whatever the drag started on, and a drag starts on the handle — so a
nineteen-pixel grip flew around the screen while the paragraph it belonged to
sat still. `dragstart` now hands `setDragImage` a copy of the block, the block
it came from dims to show what is being carried, and the drop line takes the
width of the block it would land against.

The copy looks like the block, which took a second pass to get right.
`setDragImage` needs an element that is in the document, and the obvious place
to put one — `document.body` — is outside everything the text inherits from:
right words, wrong font, wrong colour, wrong measure, and no background at all,
because an editor's own `background-color` is usually `transparent` and the page
paints behind it. The copy now sits in a wrapper carrying the editor's class,
with the inherited properties that come from the page copied across and the
background resolved by walking up to the first ancestor that actually paints
one. Nothing is added to it: no padding, no shadow, no fade.

Three new variables with defaults — `--matra-drag-handle`,
`--matra-drag-ghost-bg` and `--matra-drop-cursor` — let a host colour all of it
without restyling elements it does not own.

## 1.1.0 — 2026-09-07

**A parse rule that declines no longer blocks the ones behind it.** Rules are
tried in priority order and the first match wins — but a rule whose `getAttrs`
returned false ended the search rather than passing the element on. One broad
rule could therefore shadow every narrow one behind it: `textStyle` claims
`span`, declines a span with no inline style, and `span[data-comment]`,
`span[data-field]`, `span[data-hashtag]` and `span[data-math]` never got a turn.
The symptom was a comment mark that vanished on the way in whenever `textStyle`
happened to be in the same schema. Declining is now "not a match", and the walk
continues.

**Extension stylesheets no longer decide a document's vertical rhythm.**
`embedCSS`, `mathCSS`, `youtubeCSS` and `pageBreakCSS` each set a fixed
`margin: 1em 0` on their node. Adjacent margins collapse to the larger of the
two, so one node with an opinion pulled every gap around it out of line with
whatever the host had set. They now read `var(--matra-block-gap, 1em)` — the
default is unchanged for anyone who sets nothing, and a host that sets
`--matra-block-gap` on its editor brings every extension into step. Page breaks
read `--matra-page-break-gap`, which defaults to `1.5em` as before.

**Twitch players and clips can be embedded.** `player.twitch.tv` and
`clips.twitch.tv` join the default allow-list. `twitch.tv` itself does not, for
the same reason the rest of Google is not on it.

## 1.0.3 — 2026-09-06

**Enter leaves a quote.** A blockquote was a room with no door: every Enter
made another paragraph inside it, and the only way out was the mouse. Lists
have had the rule since `splitListItem` — an empty item means the writer is
finished — but the containers that are not lists never got it.
`exitContainerOnEmpty` puts the rule in one place, wired into `blockquote`
and `callout`, so a new container gets the behaviour by binding a key rather
than reimplementing the check. It fires only on a caret in an empty textblock
that is the last child, so Enter in the middle of a quote still splits and
Enter outside one is untouched.

**`autofocus: 'start' | 'end'` does what it says.** The option has been typed
that way since 1.0, but mount only checked truthiness, so both strings behaved
like `true` and the caret stayed wherever it already was.

**Contact addresses moved to matrajs.com.** `amrela.co` does not resolve, so
the address in the licence files — the one to write to about buying a licence
— had been bouncing.

## 1.0.2 — 2026-09-05

**Solid mounts.** A Solid ref runs when its element is made, before it is in
the page — and an element cloned from a template does not even belong to the
page's document yet. The editor was mounted on it anyway, so the drag handle
had no body to go in and the mount threw. `createMatra` now mounts once the
element is in place, and the drag handle is built on the first mouse move
when there is no body to put it in at mount. Found by running the install
matrix's Solid app in a real Chrome: happy-dom gives cloned elements a
document, so the DOM checks had passed.

**The browser benchmark, rerun.** Matra 1.0.1 against Tiptap 3.31, Lexical
0.50 and Slate 0.126 in Chrome 152, all four mounted in one page, the median
of three runs. Matra leads every row; the tables in `BENCHMARKS.md`, on the
landing page and on the benchmarks page carry the new figures.

## 1.0.1 — 2026-09-05

Three bugs a person meets in the first minute, found by driving every
extension through the built package in every framework, and the harness that
found them.

**The caret stays put through a change of structure.** Select a word, press
the heading button, press bold: the word is bold. Press Tab in a list item:
the caret is still in the word it was in. Both failed, because a structural
change — a paragraph made a heading, blocks wrapped in a list or a quote, an
item nested or lifted, a block split — was a plain replacement whose position
map sent every position inside it to the end. A replace step can now carry
the finer story (`[start, oldSize, newSize]` triples over the tokens that
actually moved), `Transform.rebuild` writes it from the runs of content an
operation keeps in place, and every structural operation in the engine uses
it. Carets, markers, decorations and collaborators' positions all follow.
The JSON is backwards compatible: a 1.0.0 client applies the same
replacement and maps the old, coarser way.

**The list button works.** Toggling a bullet, ordered or task list off did
nothing at all: there was no wrapper to lift a paragraph out of, so the
command was refused. Turning two selected paragraphs into a list made one
item holding both. The three toggles now share one command: outside a list
the selected blocks become a list, one item each; in a list of that kind the
selected items leave it, one level out when nested and out to plain blocks at
the top; in a list of another kind the list changes kind where it stands.
Shift-Tab on a top-level item leaves the list the same way.

**What is drawn on an element is what the document says.** A node
decoration — the focus class, a search highlight — whose whole range an edit
replaced was forgotten by the renderer's comparison, so the element it was
drawn on was patched and kept its class: after `setContent` two paragraphs
could both claim the caret. The renderer now remembers what it drew on each
element and inside it, and compares against that.

**`pnpm exercise`.** Every extension the package exports, built into one
editor and driven the way a person drives it — every command run, every
input rule typed, paste pasted, menus waited for — against the built package
in a DOM. The install matrix runs the same file inside each of the five
framework apps, so a framework proves three things at once: the package
installs, every extension works in it, and the binding relays what happened.
CI runs both.

**Bundle.** The starter kit is 31 kB gzipped, from 30. The budget is 32.

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
