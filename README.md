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
| `@matra/core` | Engine, document model, extension API, starter kit |
| `@matra/react` | `useEditor`, `useEditorState`, `EditorContent` |
| `@matra/ai` | Streaming edits that survive concurrent typing |
| `matra` | Convenience meta-package re-exporting `@matra/core` |

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

Early but real: the engine, starter kit, React bindings and AI extension are
implemented and tested. APIs may still move before 0.1.

MIT.
