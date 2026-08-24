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
| `@matrajs/react` | `useEditor`, `useEditorState`, `EditorContent` | MIT |
| `@matrajs/vue` | `useEditor`, `EditorContent` | MIT |
| `@matrajs/ai` | Streaming edits that survive concurrent typing | Commercial |
| `@matrajs/collab` | Authority, step rebasing, remote cursors | Commercial |

> The `@matra` npm scope belongs to an unrelated project, so bindings live under
> `@matrajs`, matching matrajs.com. The headline install stays `npm i @matrajs/core`.

## Quick start

```ts
import { createEditor, starterKit } from '@matra/core'

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
pnpm dev        # playground at localhost:5173
pnpm test       # vitest
pnpm typecheck  # tsc, including the type-level tests
pnpm check      # biome
pnpm build      # tsup, all packages
```

## Status

0.1 — the engine is ours end to end. Document model, transforms, position
mapping, editor state and the editable view are written from scratch, with
**zero runtime dependencies**. 309 tests, 45 of them adversarial.

An app bundles **18.4 kB gzipped**, because nothing arrives that the editor
does not use.

Not built yet, and worth knowing before you pick it: **drag and drop**.

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
| **Review** | threaded comments anchored to ranges | Tiptap charges for these |
| **Paid** | AI streaming, collaboration with remote cursors | |

The four in bold that Tiptap puts behind its Pro tier — table of contents,
unique ids, drag-handle-adjacent structure work, and comments — are free here.
That is the deliberate shape of it: the things that take a week are free and
drive adoption, and the two that took months are what you pay for.

`toMarkdown` and `fromMarkdown` are pure string work rather than a trip through
HTML, so they run in Node, in a worker, and at the edge. Turning a document into
Markdown on a server does not need a DOM polyfill.

## Licence

**The core is MIT and stays that way.** `@matrajs/core`, `@matrajs/react` and
`@matrajs/vue` — the engine, the document model, the extension API, the starter
kit, tables, comments, every mark and node that ships in the box. No open-core
asterisk on any of it, no feature removed later to sell back.

**AI and collaboration are paid.** `@matrajs/ai` and `@matrajs/collab` are
source-available under the [Matra Commercial License](./packages/ai/LICENSE):
free to evaluate, develop against, test, teach with, and use in personal
projects and small internal tools; paid per developer in production. They are
the two things here that took months rather than days — streaming edits that
survive concurrent typing, and rebasing another client's work over unsent local
work without losing either.

There is no licence key and nothing phones home. The licence is an agreement,
not a mechanism.

**Versions up to 0.5.0 shipped under MIT, including `ai` and `collab`, and that
grant cannot be withdrawn.** Anyone already on 0.5.0 may stay there under MIT
forever. The commercial licence starts at 0.6.0.
