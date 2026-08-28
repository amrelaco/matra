# Matra

A headless rich text editor framework with a first-class extension API.

- **No engine leakage** — the document model is plain JSON; no ProseMirror type appears in a public signature
- **Plain objects, plain functions** — no `this`, no classes, no inheritance chains
- **Inferred types** — adding an extension adds its commands, fully typed, with no module augmentation
- **Async-safe** — position mapping is built in, so a late AI response cannot corrupt the document

See [DESIGN.md](./DESIGN.md) for the API rationale.

## Packages

| Package | Purpose | Licence |
|---|---|---|
| `@matrajs/core` | Engine, document model, extension API, starter kit | MIT |
| `@matrajs/react` | `useEditor`, `useEditorState`, `useEditorFocus`, `EditorContent` | MIT |
| `@matrajs/vue` | `useEditor`, `useEditorState`, `useEditorFocus`, `EditorContent` | MIT |
| `@matrajs/svelte` | `matra` — a `use:` action, the editor, and a state store | MIT |
| `@matrajs/solid` | `createMatra` — the editor, a `mount` ref, and a state signal | MIT |
| `@matrajs/ai` | Streaming edits that survive concurrent typing | Commercial |
| `@matrajs/collab` | Authority, step rebasing, remote cursors | Commercial |
| `@matrajs/versions` | Snapshots, a real diff between them, restore as one undo step | Commercial |

> The `@matra` npm scope belongs to an unrelated project, so bindings live under
> `@matrajs`, matching matrajs.com. The headline install stays `npm i @matrajs/core`.

## Quick start

```ts
import { createEditor, starterKit } from '@matrajs/core'

const editor = createEditor({
  extensions: starterKit,
  content: '<p>Hello</p>',
})

editor.mount(document.querySelector('#editor')!)
editor.commands.toggleBold()
```

Every command comes from the array you passed. Nothing else is on `editor.commands`,
and calling something that is not there is a compile error.

## Security

Document JSON, pasted HTML and collaborative steps are all treated as hostile,
and the rendering path is the gate they all pass through: executable attributes
are never set, URL attributes are scheme-checked, undeclared attributes are
dropped, and commands report failure rather than throwing. See
[SECURITY.md](./SECURITY.md).

## Development

```bash
pnpm install
pnpm dev         # playground at localhost:5173
pnpm test        # vitest
pnpm typecheck   # tsc, including the type-level tests
pnpm check       # biome, and prettier for .astro
pnpm build       # tsup, all packages
pnpm size        # the bundle ladder the site quotes
pnpm bench:check # the performance ratchet, against the recorded baseline
pnpm links       # no dead internal links on the site
pnpm wiring      # every script on the site finds the markup it asks for
```

## Status

0.15 — the engine is ours end to end. Document model, transforms, position
mapping, editor state and the editable view are written from scratch, with
**zero runtime dependencies**. 551 tests, 56 of them adversarial.

An app on the starter kit bundles **24.7 kB gzipped**, because nothing arrives
that the editor does not use. The whole ladder, from an empty extension array
upwards, is measured by `pnpm size` and checked in CI.

Drag and drop landed in 0.9.0: blocks drag with a handle, a line shows where
they will land, and the move is one undo step.

The view passes its tests but has not yet met real IME users on iOS Safari or
Android Chrome. See [ENGINE.md](./ENGINE.md) for where the risk actually sits.

## Extensions

Everything in the box, and everything free unless marked.

| | | |
|---|---|---|
| **Text** | bold, italic, strike, code, underline, highlight, subscript, superscript, link | |
| **Blocks** | paragraph, heading, blockquote, code block, horizontal rule, hard break, image | |
| **Lists** | bulleted, ordered, **task lists** with real checkboxes | |
| **Tables** | insert, delete, header rows, colspan and rowspan | |
| **Writing** | placeholder, character count, text align, **typography** | smart quotes, dashes, arrows |
| **Structure** | **table of contents**, **unique block ids** | Tiptap charges for both |
| **Interchange** | **Markdown in and out**, with no DOM | runs on a server |
| **Dragging** | block drag and drop, **drag handle**, drop cursor | Tiptap charges for the handle |
| **Review** | threaded comments anchored to ranges | Tiptap charges for these |
| **Menus** | `@` mentions and `/` commands, detection only | the popup is yours |
| **Paid** | AI streaming, collaboration with remote cursors, version history | |

The four in bold that Tiptap puts behind its Pro tier — table of contents,
unique ids, drag-handle-adjacent structure work, and comments — are free here.
That is the deliberate shape of it: the things that take a week are free and
drive adoption, and the ones that took months are what you pay for.

`toMarkdown` and `fromMarkdown` are pure string work rather than a trip through
HTML, so they run in Node, in a worker, and at the edge. Turning a document into
Markdown on a server does not need a DOM polyfill.

## Against the alternatives

Measured, not asserted — see [BENCHMARKS.md](./BENCHMARKS.md) for the method and
what the numbers are not.

| | Matra | Tiptap | Lexical | Slate |
|---|---|---|---|---|
| Bundle, gzipped | **24.7 kB** | 117 kB | ~35 kB | ~50 kB |
| Runtime dependencies | **0** | 51 packages | few | several |
| Engine types in your code | **none** | ProseMirror | Lexical | Slate |
| Command types | **inferred** | module augmentation | manual | manual |
| Async position safety | **built in** | manual | manual | manual |
| Vue | **first-class** | community | none | community |
| Svelte and Solid | **first-class** | community | none | community |
| Markdown without a DOM | **yes** | no | no | no |
| Table of contents | **free** | paid | build it | build it |
| Unique block ids | **free** | paid | build it | build it |
| Drag handle | **free** | paid | build it | build it |
| Comments | **free** | paid | build it | build it |
| Runtime licence check or phone-home | **never** | none | n/a | n/a |

Where the alternatives win, and it is worth saying so: ProseMirror's ecosystem
is a decade deep and Tiptap inherits all of it, Lexical has been hardened by
Meta's traffic, and both have met far more real IME users than this has. If you
need a mature extension for something exotic today, they have it and this does
not.

## Releasing

One registry, and an order that matters. See [RELEASING.md](./RELEASING.md).

## Licence

**The core is MIT and stays that way.** `@matrajs/core` and every framework
binding — `@matrajs/react`, `@matrajs/vue`, `@matrajs/svelte` and
`@matrajs/solid` — the engine, the document model, the extension API, the
starter kit, tables, comments, every mark and node that ships in the box. No
open-core asterisk on any of it, no feature removed later to sell back.

**AI, collaboration and version history are paid.** `@matrajs/ai`,
`@matrajs/collab` and `@matrajs/versions` are source-available under the
[Matra Commercial License](./packages/ai/LICENSE):
free to evaluate, develop against, test, teach with, and use in personal
projects and small internal tools; paid per developer in production. They are
the things here that took months rather than days — streaming edits that
survive concurrent typing, rebasing another client's work over unsent local
work without losing either, and a real diff between two snapshots of a
document.

**Nothing phones home and there is no runtime licence check.** Your editor
never talks to us, in development or in production, and a lapsed subscription
cannot switch anything off in an app you already shipped.

There is no download gate either. The source is in this repository and the
packages install from public npm — the licence is the boundary, as with the
Business Source Licence. What a subscription buys is the right to run them in
production, plus updates and support.

**Versions up to 0.5.0 shipped under MIT, including `ai` and `collab`, and that
grant cannot be withdrawn.** Anyone already on 0.5.0 may stay there under MIT
forever. The commercial licence starts at 0.6.0.
