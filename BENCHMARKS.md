# Benchmarks

Run them yourself: `node bench/bench.mjs`.

## Bundle

An app importing the editor and the starter kit, bundled with esbuild,
minified, gzipped:

| | minified | gzipped |
|---|---|---|
| **Matra** | 65.3 kB | **20.7 kB** |
| Tiptap 3.30 | 370.5 kB | 117.2 kB |

**5.7× smaller.** Matra has no runtime dependencies; Tiptap brings ProseMirror,
which is 51 packages in `node_modules`.

## Speed

Node 22, happy-dom, 2000 paragraphs of ordinary prose. Milliseconds, lower is
better.

| operation | Matra | Tiptap | |
|---|---|---|---|
| create + parse a document | **0.70** | 21.62 | 31× faster |
| `getHTML()` | **19.07** | 20.24 | 1.1× faster |
| `getJSON()` | 0.16 | **0.11** | 1.5× slower |
| keystroke, mounted | 0.67 | **0.63** | 1.1× slower |

At 200 paragraphs — nearer the size of a real document — Matra leads on all
four, including the keystroke (0.12 vs 0.17).

## What these numbers are not

**The view timings are not browser timings.** They run against happy-dom, whose
cost model is its own: `nextSibling` is not O(1) there, and a change that made
the diff faster in a browser measured slower under it. Treat `create + parse`,
`getJSON` and the bundle figures as solid, and the mounted-keystroke figure as
indicative until it is measured in Chrome and Safari.

**They are one shape of document.** Flat paragraphs of similar length. Deeply
nested lists, huge tables and documents full of marks all stress different
paths, and none of them are measured here yet.

**Run-to-run noise is real** — 10–20% between runs on the same build. A number
that moves less than that has not moved.

## Where the time went

Typing used to cost the size of the document. Two things caused it, both found
by measuring rather than reading:

- **The position map was rebuilt on every keystroke.** Every node was
  re-recorded, so a 4000-paragraph document did eight thousand map writes per
  character — all of them to say the same thing shifted by one. The map now
  absorbs the transaction's mapping and translates positions when asked.
- **The diff visited every block.** It now skips any block the edit's span did
  not touch: 3999 of 4000 children on a keystroke.

And one that was pure waste: `toJSON` called `Object.keys(attrs).length` to ask
whether a node had attributes, allocating an array per node to answer a
question about emptiness.
