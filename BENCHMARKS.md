# Benchmarks

Run them yourself: `node bench/bench.mjs`.

## Bundle

An app importing the editor and the starter kit, bundled with esbuild,
minified, gzipped:

| | minified | gzipped |
|---|---|---|
| **Matra** | 94.6 kB | **31 kB** |
| Tiptap 3.30 | 370.5 kB | 117.2 kB |

**3.8× smaller.** Matra has no runtime dependencies; Tiptap brings ProseMirror,
which is 51 packages in `node_modules`. The figure was 25 kB at 0.16; 1.0
spent 3.6 kB on the engine doing more — attributes one extension adds to
another's nodes, paste and drop hooks, files and text dropped from outside,
blocks inserted into the middle of a paragraph, decorations compared after
mapping, paragraphs patched in place, positions found by bisection — and
every one of those is on the runtime side of this file.

## Speed, in a browser

Four editors mounted in the same page, in the same run, in WebKit. Each cell is
the median of three runs of a median of seven samples. Milliseconds, lower is
better. `bench/browser` builds and runs this.

**No editor** is the same paragraphs built by hand into a `contenteditable`
div, with nothing else in the page — the floor none of these can go under.

| operation | No editor | Matra | Tiptap | Lexical | Slate |
|---|---|---|---|---|---|
| parse a document, 2000 ¶ | — | **8.3** | 15.6 | 77.6 | — |
| `getHTML()`, 2000 ¶ | — | **1.5** | 3.6 | 7.1 | — |
| keystroke, 200 ¶ | — | **0.127** | 0.275 | 0.197 | — |
| keystroke, 2000 ¶ | — | **0.847** | 1.188 | 1.160 | — |
| mount + first render, 200 ¶ | 1.1 | **2.0** | 4.3 | 3.2 | 8.0 |
| mount + first render, 2000 ¶ | 10.9 | **22.1** | 37.7 | 26.0 | 93.0 |

**Absolute milliseconds only mean anything within one run.** Same harness, same
browser, a different day: Lexical parsed the same document in 34.7 ms one week
and 71.6 ms the next, without a line of it changing. That is why all four are
mounted in one page and measured in one pass, and why comparing a number here
against a number from an older copy of this file is comparing two machines.

**Every mount is checked, not trusted.** The harness mounts once more outside
the timing and looks for the last paragraph's text on screen. A reconciler that
returns before its DOM exists is the cheapest possible way to win the mount row,
and an earlier version of this harness reported a number for Slate when nothing
had been drawn at all.

**The keystroke row changed hands.** It used to be the row Matra lost. Measured
back to back against the same rivals in the same session:

| keystroke | before | after |
|---|---|---|
| 200 paragraphs | 0.246 | **0.127** |
| 2000 paragraphs | 1.465 | **0.847** |

What was costing it, all of it found by profiling rather than by reading:

- **Every ancestor of the edit was rebuilt by cutting.** A paragraph changes and
  each ancestor up to the document is rebuilt around it — by cutting the run of
  children in two, appending the replacement, appending the rest, and re-adding
  every child's size to get a total that differed from the old one by exactly
  one child. On a 2000-block document that is four walks of two thousand
  children per character. `Fragment.replaceChild` swaps the one child that moved
  and does the arithmetic in one subtraction.
- **The diff reached into the DOM for blocks it had already decided to skip.**
  The loop read `childNodes[i]` before asking whether child `i` was inside the
  edit at all. `childNodes` is a live list, and for 1999 of 2000 blocks the
  answer was thrown away. Asking first, indexing second.
- **Every sixty-fourth keystroke threw the rendered document away.** The
  position map absorbs each edit's mapping instead of rewriting itself, and
  capped the backlog at 64 — past which the renderer rebuilt the entire
  document's DOM. It was the backlog that had gone stale, not the DOM, so now
  only the backlog is dropped and the positions are recorded again in place. A
  rebuild also silently dropped every mounted node view's state, which is a
  correctness bug wearing a performance bug's clothes.
- **The position map allocated an entry per node per edit** to record a position
  it already held. It reuses the entry now.

In Node, against happy-dom, where none of the browser's layout cost is in the
way, those take a keystroke on a 2000-paragraph document from 0.464 ms to
0.062 ms, and the cost stops tracking the length of the document: 0.045 ms at
20 blocks against 0.062 ms at 2000.

**The mount row was wrong, and the harness was why.** This file used to say
Lexical put an editor on screen faster. It does not. Teardown ran *inside* the
timed function and the layout read came after it, so an editor whose teardown
detaches its DOM had taken its document off screen before the browser was asked
to lay anything out. Lexical's teardown does that; Matra's drops listeners and
leaves the document where it is. Matra was paying for two thousand paragraphs of
layout and Lexical was not, on a row where layout is most of the number.
Teardown now runs after the clock stops and both mount rows changed hands. Same
class of mistake the harness already refused to make for Slate, one level up.

The first render did get faster while this was being chased — 0.77 ms to 0.59 ms
for two hundred blocks in Node — by building into a document fragment and
attaching it once rather than appending block by block into a live tree,
dropping the mark stack's three arrays per child for marks that blocks never
have, and taking a direct path for the `['p', 0]` shape most nodes render as.

**What is missing and why.** Slate's keystroke goes through a React render that
has not happened by the time the timer stops, and the harness checks whether the
text on screen changed during the measurement — when it did not, it reports
`NOT MEASURED` instead of a number. An earlier version of the harness cheerfully
reported Slate at 0.02 ms per keystroke, which was the model update with nothing
drawn behind it.

**What is not like-for-like.** Each editor is driven through its own idiomatic
API. Lexical and Slate carry the rich-text behaviour their own quick-starts
prescribe, which is not the same feature set as Matra's or Tiptap's starter kit.

## Speed, in Node

happy-dom, same document. Useful for the parts that never touch a DOM:

| operation | Matra | Tiptap | |
|---|---|---|---|
| create + parse a document | **0.70** | 21.62 | 31× faster |
| `getJSON()` | **0.16** | 0.11 | 1.5× slower |

## 1.0, in Node

The ratchet's own figures, before and after, in the calibrated units
`bench/bench.mjs` prints — the same machine, the same run, the floor of three
passes each:

| figure | 0.16 | 1.0 | |
|---|---|---|---|
| create editor, 50 ¶ | 17.5 | **3.7** | 4.7× |
| setContent JSON, 2000 ¶ | 127.2 | **80.4** | 1.6× |
| `getHTML()`, 2000 ¶ | 89.6 | **30.3** | 3.0× |
| `getJSON()`, 2000 ¶ | 11.3 | **9.7** | 1.2× |
| `getText()`, 2000 ¶ | 27.6 | **7.5** | 3.7× |
| insert one character | 2.73 | **0.22** | 12× |
| toggle bold over a range | 4.46 | **0.26** | 17× |
| keystroke, mounted, 500 ¶ | 5.04 | **2.17** | 2.3× |

And the ones the ratchet did not measure, in microseconds, because they are
where the time actually went:

| operation, 2000 ¶ | 0.16 | 1.0 | |
|---|---|---|---|
| keystroke at the **end** of the document, mounted | 180 | **34** | 5.3× |
| keystroke at the start, mounted | 77 | **48** | 1.6× |
| toggle bold on a word near the end | 453 | **20** | 23× |
| `isActive('bold')` + `isActive('heading')` | 1.47 | **0.12** | 12× |
| `createEditor`, empty | 85 | **16** | 5.3× |
| parse 2000 ¶ of HTML with marks (ms) | 77 | **55** | 1.4× |

What was costing it:

- **Every position was found by walking.** Resolving a position walked the
  document's children from the first, adding sizes until it passed the point,
  and a keystroke resolves a dozen positions. Typing at the end of a
  two-thousand-block document cost twelve times what typing at the top did,
  and the benchmark only ever typed at the top. A fragment past twenty-four
  children now keeps a prefix index and bisects it.
- **A mark on one word rebuilt the whole document.** Asking "is this bold"
  visited every node in the document to find the ones in the selection, and
  applying the mark rebuilt every level from the first child to the last.
  Both now walk only what the range touches, and only the children that
  changed are swapped into their parent.
- **`toDOM` was handed a full JSON serialisation of the node.** Rendering a
  paragraph serialised its text; rendering the document serialised the
  document, once per level, so that a function returning `['p', 0]` could read
  an attribute. It now gets an object that carries the type and the attributes
  and builds the rest on demand.
- **Every command built a fresh object of twenty closures**, and every
  `isActive` started a transaction to answer a question about the state. The
  context is a class now and the transaction starts on first write, so
  asking is free.
- **The character counter re-serialised the document on every click.**
  Any extension reading `ctx.doc` in its reducer paid for the whole document
  on every transaction, caret moves included. The counter reads the engine's
  text and only when the document changed; `ctx.doc` is cached per document
  within a command.
- **The drag handle asked the browser for every block's rectangle on every
  mouse move.** Blocks stack, so the one under the pointer is found by
  bisection: eleven rectangles on a two-thousand-block page, not two thousand.
- **The undo history copied the whole entry to add each keystroke to it.**
  Inverses are appended and replayed from the end.
- **Every keystroke wrote the browser selection**, even when it was already
  where it was about to be put, and every write came straight back as a
  `selectionchange` event to be read and found identical.
- **A decoration anywhere threw the narrowed redraw away.** Last render's
  decorations are now mapped through the edit before being compared, so a
  search hit that merely moved is the same hit, and only the span where the
  decorations really differ is added to what gets redrawn.

## Where the time went, the first time

Two earlier rounds, kept because both are the kind of thing that grows back:

- **The position map was rebuilt on every keystroke.** Every node was
  re-recorded, so a 4000-paragraph document did eight thousand map writes per
  character — all of them to say the same thing shifted by one. The map now
  absorbs the transaction's mapping and translates positions when asked.
- **The diff visited every block.** It now skips any block the edit's span did
  not touch: 3999 of 4000 children on a keystroke.

And one that was pure waste: `toJSON` called `Object.keys(attrs).length` to ask
whether a node had attributes, allocating an array per node to answer a
question about emptiness.
