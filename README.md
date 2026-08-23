# Matra

A headless rich text editor framework with a first-class extension API.

- **No engine leakage** — the document model is plain JSON; no ProseMirror type appears in a public signature
- **Plain objects, plain functions** — no `this`, no classes, no inheritance chains
- **Inferred types** — adding an extension adds its commands, fully typed, with no module augmentation
- **Async-safe** — position mapping is built in, so a late AI response cannot corrupt the document

See [DESIGN.md](./DESIGN.md) for the API rationale.

## Packages

| Package | Purpose |
|---|---|
| `@matrajs/core` | Engine, document model, extension API, starter kit |
| `@matrajs/react` | `useEditor`, `useEditorState`, `EditorContent` |
| `@matrajs/ai` | Streaming edits that survive concurrent typing |

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
**zero runtime dependencies**. 178 tests.

An app bundles **18.4 kB gzipped**, because nothing arrives that the editor
does not use.

Not built yet, and worth knowing before you pick it: collaborative transport
(steps rebase, but there is no wire protocol or presence), node views,
decorations, drag and drop, and tables. The view passes its tests but has not
yet met real IME users on iOS Safari or Android Chrome — see
[ENGINE.md](./ENGINE.md).

MIT.
