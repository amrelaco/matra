# @matrajs/core

A headless rich text editor framework. Engine, document model, extension API and
starter kit — framework-agnostic and MIT.

```bash
npm i @matrajs/core
```

```ts
import { createEditor, starterKit } from '@matrajs/core'

const editor = createEditor({ extensions: starterKit, content: '<p>Hello</p>' })
editor.mount(element)
editor.commands.toggleHeading(2)
```

## What makes it different

**Commands are inferred.** `editor.commands` is built from the definitions you
pass — no module augmentation, no registry, no generics to thread. Calling a
command no extension defines is a compile error.

**The engine stays hidden.** The document is plain JSON and no engine type
appears in a public signature. `editor.unsafe` is the escape hatch and is
excluded from semver.

**Positions survive time.** `ctx.mark()` returns a marker that re-resolves a
range through every edit made since it was taken — the reason a three-second-late
AI response lands on the right words instead of corrupting the paragraph.

## Companions

- `@matrajs/react` — `useEditor`, `useEditorState`, `EditorContent`
- `@matrajs/ai` — streaming edits that survive concurrent typing

- Docs: https://matrajs.com
- Source: https://github.com/amrelaco/matra

MIT.
