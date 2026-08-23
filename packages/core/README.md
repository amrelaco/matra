# @matra/core

The Matra engine: document model, extension API, command context and the
starter kit. Headless and framework-agnostic.

```ts
import { createEditor, starterKit } from '@matra/core'

const editor = createEditor({ extensions: starterKit, content: '<p>Hello</p>' })
editor.mount(element)
editor.commands.toggleHeading(2)
```

## What makes it different

**Commands are inferred.** `editor.commands` is built from the definitions you
pass — no module augmentation, no registry, no generics to thread.

**The engine stays hidden.** The document is plain JSON and no ProseMirror type
appears in a public signature. `editor.unsafe` exists as an escape hatch and is
excluded from semver.

**Positions survive time.** `ctx.mark()` returns a marker that re-resolves a
range through every edit made since it was taken — the reason a three-second-late
AI response lands on the right words.

- Docs: https://matrajs.com
- Source: https://github.com/amrelaco/matra

MIT.
