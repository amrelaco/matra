# Benchmarks

Run them yourself: `node bench/bench.mjs`.

## Bundle

An app importing the editor and the starter kit, bundled with esbuild,
minified, gzipped:

| | minified | gzipped |
|---|---|---|
| **Matra** | 68.6 kB | **21.9 kB** |
| Tiptap 3.30 | 370.5 kB | 117.2 kB |

**5.4× smaller.** Matra has no runtime dependencies; Tiptap brings ProseMirror,
which is 51 packages in `node_modules`.

## Speed, in a browser

Safari/WebKit, 2000 paragraphs of ordinary prose. Median of seven samples.
Milliseconds, lower is better.

| operation | Matra | Tiptap | |
|---|---|---|---|
| mount + first render | **14.1** | 15.3 | 1.1× faster |
| keystroke, mounted | 0.84 | 0.84 | level |
| `getHTML()` | **1.41** | 1.76 | 1.25× faster |
| `getJSON()` | **0.05** | 0.05 | level |

At 200 paragraphs — nearer the size of a document someone actually writes —
Matra is ahead on everything:

| operation | Matra | Tiptap | |
|---|---|---|---|
| mount + first render | **1.58** | 3.12 | 2.0× faster |
| keystroke, mounted | **0.16** | 0.18 | 1.1× faster |
| `getHTML()` | **0.15** | 0.20 | 1.3× faster |

Two runs, `bench/browser`. Keystroke at 2000 moved between 0.90× and 1.01× of
Tiptap across runs, so the honest reading is *level*, not *ahead*.

## Speed, in Node

happy-dom, same document. Useful for the parts that never touch a DOM:

| operation | Matra | Tiptap | |
|---|---|---|---|
| create + parse a document | **0.70** | 21.62 | 31× faster |
| `getJSON()` | **0.16** | 0.11 | 1.5× slower |

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
