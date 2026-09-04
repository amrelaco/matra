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

## In the box

Seventy-nine extensions, every one importable on its own and none of them in
your bundle unless you pass it: the starter kit, text style, tables with row
and column commands, task lists, callouts, collapsible toggles, YouTube and
sandboxed embeds, search and replace, autolink, emoji, indent, clear
formatting, code highlighting, a drag handle, comments, mentions, slash
menus, bubble and floating menus, Markdown in and out, a table of contents,
unique ids, a file handler, image resizing, locked blocks, template fields
with a mail merge that needs no editor, snippets, columns, page breaks, line
height, text direction, footnotes, math, text case, invisible characters,
selection highlight, typewriter scrolling, autosave, smart paste, hashtags,
ghost-text completion and dictation. The directory with the line you would
write for each is at https://matrajs.com/extensions.

## Companions

- `@matrajs/react`, `@matrajs/vue`, `@matrajs/svelte`, `@matrajs/solid` — bindings, each one thin
- `@matrajs/ai` — streaming edits that survive concurrent typing
- `@matrajs/collab` — authority, rebasing and remote cursors
- `@matrajs/versions` — snapshots, a real diff, restore as one undo step
- `@matrajs/mcp` — this documentation as an MCP server, for any AI tool

- Docs: https://matrajs.com
- Source: https://github.com/amrelaco/matra

MIT.
