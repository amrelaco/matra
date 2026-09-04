# Matra

A headless rich text editor framework with a first-class extension API.

- **No engine leakage** — the document model is plain JSON; no ProseMirror type appears in a public signature
- **Plain objects, plain functions** — no `this`, no classes, no inheritance chains
- **Inferred types** — adding an extension adds its commands, fully typed, with no module augmentation
- **Async-safe** — position mapping is built in, so a late AI response cannot corrupt the document

See [DESIGN.md](./DESIGN.md) for the API rationale, [CHANGELOG.md](./CHANGELOG.md)
for what changed when, and [CONTRIBUTING.md](./CONTRIBUTING.md) before a pull
request.

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

Matra is মাত্রা — the horizontal line that runs across the top of Bengali
script and holds a word together. Packages live under the `@matrajs` scope,
matching matrajs.com.

**Installing a binding installs the engine with it.** For a React application
`pnpm add @matrajs/react` is the entire install: one package, and no
third-party dependency arrives behind it.

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

## The packages in detail

Eight packages, one version number, released together. Every other package
depends on `@matrajs/core` and on nothing else, so installing a binding
installs the whole editor — there is no second package to remember, no
`@matrajs/pm` to keep in step, and no peer range to resolve by hand.

---

### `@matrajs/core` — MIT

The engine, and the only package that is not optional. The document model,
transforms, position mapping, editor state and the editable view are written
here, with **zero runtime dependencies**.

```sh
pnpm add @matrajs/core
```

**Entry points**

| Export | What it is |
|---|---|
| `createEditor(options)` | Builds an editor. The `extensions` array decides everything else about it. |
| `buildSchema(extensions)` | The schema alone, for validating a document with no view and no DOM. |
| `pos(…)`, `range(…)` | Constructors for the two position types. |
| `starterKit` | Seventeen extensions in one array — document, paragraph, text, heading, blockquote, code block, bullet/ordered/list item, horizontal rule, hard break, bold, italic, strike, code, link, history. |
| 79 named extensions | Every entry in [Extensions](#extensions), each importable on its own. |
| Helpers | `tableOfContents(doc)`, `assignIds(doc)`, `commentRanges(doc)`, `activeSuggestion(editor)`, `searchEmoji(query)`, `youtubeId(url)`, `normalizeUrl(text)`, `fieldsIn(doc)`, `fillFieldsIn(doc, values)`, `hashtagsIn(doc)`, `parseDelimited(text)`, `dictationSupported()` — plain functions, not extensions. |
| `toMarkdown`, `fromMarkdown` | Pure string work, so they run in Node, in a worker and at the edge. |
| `…CSS` helpers | `placeholderCSS`, `commentCSS`, `taskListCSS`, `dragHandleCSS`, `suggestionCSS`, `searchCSS`, `lockedCSS`, `fieldsCSS`, `columnsCSS`, `footnotesCSS` and the rest — stylesheets to paste into an app rather than a stylesheet to import. |

**`EditorOptions`**

| Field | Type | Notes |
|---|---|---|
| `extensions` | `readonly AnyDef[]` | Declare it `as const`. The tuple is what makes the commands infer. |
| `content` | `DocNode \| string` | Document JSON, or HTML to parse. |
| `editable` | `boolean` | |
| `autofocus` | `boolean \| 'start' \| 'end'` | |
| `element` | `HTMLElement` | Mount as soon as the editor exists, instead of calling `mount` yourself. |

**The editor**

| Member | Signature | |
|---|---|---|
| `commands` | `CommandsOf<T> & CoreCommands` | Only what the extensions you passed provide. Anything else is a compile error. |
| `can` | same shape | Asks instead of does, so a button can be disabled rather than dead. |
| `batch(run)` | `=> boolean` | Several commands, one undo step. Rolls back entirely if any returns `false`. |
| `isActive(name, attrs?)` | `=> boolean` | Marks first, then nodes · `isActive('heading', { level: 2 })` reads naturally. |
| `getJSON()` | `=> DocNode` | |
| `getHTML()` | `=> string` | Answers without a DOM. |
| `getText()` | `=> string` | |
| `setContent(content)` | `=> void` | |
| `selection` | `Selection` | |
| `editable` / `setEditable(v)` | | |
| `on(event, fn)` | `=> () => void` | `change`, `focus`, `blur`, `selectionChange`. Returns its own unsubscribe. |
| `extensionState<S>(name)` | `=> S \| undefined` | How a toolbar reads a character count or a collab version without a global. |
| `mount(el)` / `destroy()` | | |
| `unsafe` | `{ view, state, schema }` | Excluded from semver. Needing it means the public API has a gap — open an issue. |

**Core commands**, present whatever you pass: `select`, `insert`, `replace`,
`remove`, `moveBlock`, `focus`. `insert` and `replace` accept blocks at a
caret inside a paragraph and split the paragraph around them, which is what
a rule or a table asked for at the caret means.

**What an extension may declare**, beyond commands, keys and input rules:

| Field | On | What it does |
|---|---|---|
| `attributes` | extension | Add attributes to nodes and marks defined elsewhere · `[{ types: ['paragraph', 'heading'], attrs: { indent: { default: 0, render, parse } } }]`. How `textAlign`, `indent` and `uniqueId` work without the paragraph knowing about them. |
| `handlePaste(ctx, { html, text, files })` | extension | Claim a paste before the editor parses it. Return `true` to keep it. |
| `handleDrop(ctx, { html, text, files, pos })` | extension | The same for something dropped from outside. Block drags inside the editor never reach it. |
| `filterChange(ctx)` | extension | Veto a change before it lands. Return `false` and the document, the selection and the undo history stay as they were · how `locked()` refuses a keystroke, a paste and a drag alike. `editor.can` asks it too. |
| `nodeViews` | extension | Render nodes defined elsewhere with your own DOM · `{ image: ({ node, getPos, editor }) => … }`. How `imageResize()` puts a handle on the stock image. |
| `decorations(ctx)` | extension | Draw over the document · highlights, widgets, a class on the current block. |
| `state` | extension | Reduced on every transaction · read with `editor.extensionState(name)`. |
| `code` | node | Whitespace inside is literal, so a pasted function keeps its line breaks. |
| `listItem` | node | Enter splits, Tab nests, Backspace at the start lifts. |
| `marks` | node | Which marks the text may carry · `''` for none. |
| `nodeView` | node | Render with your own DOM and keep it across edits. |

---

### `@matrajs/react` — MIT

```sh
pnpm add @matrajs/react
```

| Export | Signature |
|---|---|
| `useEditor(options)` | `Editor<T>` — created lazily on first render, destroyed on unmount. |
| `useEditorState(editor, select)` | `S` — a `useSyncExternalStore` subscription to `change` and `selectionChange`. |
| `useEditorFocus(editor)` | `boolean` |
| `EditorContent` | `{ editor }` plus every `div` attribute. |

```tsx
import { starterKit } from '@matrajs/core'
import { EditorContent, useEditor, useEditorState } from '@matrajs/react'

export function Notes() {
  const editor = useEditor({ extensions: starterKit, content: '<p>Hello</p>' })
  const bold = useEditorState(editor, (e) => e.isActive('bold'))

  return (
    <>
      <button onClick={() => editor.commands.toggleBold()} aria-pressed={bold}>
        Bold
      </button>
      <EditorContent editor={editor} className="prose" />
    </>
  )
}
```

Options are read once. Changing them later does not recreate the editor,
because tearing down a live document on a prop change loses the user's work —
use the commands instead. The mount is guarded on `unsafe.view`, so StrictMode's
double invoke cannot leave two views fighting over one element.

---

### `@matrajs/vue` — MIT

The same four names as React, returning refs.

```sh
pnpm add @matrajs/vue
```

| Export | Signature |
|---|---|
| `useEditor(options)` | `Editor<T>`, `markRaw`ped · works in a component or a bare effect scope. |
| `useEditorState(editor, select)` | `Readonly<Ref<S>>` |
| `useEditorFocus(editor)` | `Readonly<Ref<boolean>>` |
| `EditorContent` | Component with an `editor` prop. |

```vue
<script setup lang="ts">
import { starterKit } from '@matrajs/core'
import { EditorContent, useEditor, useEditorState } from '@matrajs/vue'

const editor = useEditor({ extensions: starterKit })
const bold = useEditorState(editor, (e) => e.isActive('bold'))
</script>

<template>
  <button :aria-pressed="bold" @click="editor.commands.toggleBold()">Bold</button>
  <EditorContent :editor="editor" />
</template>
```

The mount is guarded, so a `<KeepAlive>` remount does not attach a second view.

---

### `@matrajs/svelte` — MIT

Svelte already has the right shape — an action runs when the element exists and
is told when it goes away — so the binding is thin on purpose. Written with
stores rather than runes, so it behaves identically on Svelte 4 and 5.

```sh
pnpm add @matrajs/svelte
```

| Export | Signature |
|---|---|
| `matra(options)` | `{ action, editor, state }` |
| `editorState(editor)` | `Readable<Editor<T>>` — republishes on change and selection. |

```svelte
<script>
  import { starterKit } from '@matrajs/core'
  import { matra } from '@matrajs/svelte'

  const { action, editor, state } = matra({ extensions: starterKit })
</script>

<button aria-pressed={$state.isActive('bold')} onclick={() => editor.commands.toggleBold()}>
  Bold
</button>
<div use:action></div>
```

The editor exists before the element does, so commands, `content` and
`getJSON()` all work before anything is on screen — which is what a server
render and a test both need.

---

### `@matrajs/solid` — MIT

Solid's reactivity is not a render loop, so there is no `useSyncExternalStore`
shape to reach for: a signal that bumps on every change is enough.

```sh
pnpm add @matrajs/solid
```

| Export | Signature |
|---|---|
| `createMatra(options)` | `{ editor, mount, state }` — bound to the component's lifetime. |

```tsx
import { starterKit } from '@matrajs/core'
import { createMatra } from '@matrajs/solid'

const { editor, mount, state } = createMatra({ extensions: starterKit })

return (
  <>
    <button aria-pressed={state().isActive('bold')} onClick={() => editor.commands.toggleBold()}>
      Bold
    </button>
    <div ref={mount} />
  </>
)
```

`state()` returns the editor itself rather than a copy: a toolbar asks
`isActive` at render time, and cloning a document to answer that would be the
expensive way to do nothing.

---

### `@matrajs/ai` — Commercial

Streaming edits that survive concurrent typing. The range being rewritten is
re-resolved against the current document on every chunk, so a user who keeps
typing while the model streams does not end up with a corrupted paragraph.

```sh
pnpm add @matrajs/ai
```

| Export | What it is |
|---|---|
| `ai(options)` | The extension. `{ stream, onStatus? }`. |
| `AiStream` | `(request: AiRequest) => AsyncIterable<string>` — yours to implement. |
| `AiRequest` | `{ text, instruction, signal }` |
| `AiSession` | `{ id, status, range, received, error? }` |
| `AiStatus` | `'idle' \| 'streaming' \| 'done' \| 'error' \| 'cancelled'` |

Commands: `askAi(instruction)`, `cancelAi()`, `acceptAi()`, `rejectAi()`.

```ts
import { createEditor, starterKit } from '@matrajs/core'
import { ai } from '@matrajs/ai'

const editor = createEditor({
  extensions: [
    ...starterKit,
    ai({
      async *stream({ text, instruction, signal }) {
        const response = await fetch('/api/rewrite', {
          method: 'POST',
          body: JSON.stringify({ text, instruction }),
          signal,
        })
        for await (const chunk of response.body!.pipeThrough(new TextDecoderStream())) yield chunk
      },
      onStatus: (session) => setSpinner(session.status === 'streaming'),
    }),
  ] as const,
})

editor.commands.askAi('make this shorter')
```

`stream` runs in your application, so the model key stays on your server. The
extension never talks to us.

---

### `@matrajs/collab` — Commercial

Step exchange, rebasing and presence, with **no CRDT dependency**. Another
client's work rebases over unsent local work without either being lost.

```sh
pnpm add @matrajs/collab
```

| Export | What it is |
|---|---|
| `collab(options)` | The extension. `{ clientId, version? }`. |
| `Authority` | The server side · `receive(version, steps)` and `since(version)`. Transport-agnostic. |
| `sendableSteps(editor)` | `Sendable \| null` — what to put on the wire. |
| `getVersion(editor)` | `number` |
| `remoteCursors()` | The presence extension. |
| `colorFor(clientId)` | A stable colour per client. |
| `remoteCursorCSS` | The stylesheet the cursor decorations expect. |
| `CollabStep`, `Presence`, `Sendable`, `CollabState` | Wire types. |

Command: `receiveCollabSteps(steps)` — steps this client sent are skipped, and a
step that no longer applies is dropped rather than thrown, because one bad
message from a peer must not take the editor down.

```ts
import { createEditor, starterKit } from '@matrajs/core'
import { collab, remoteCursors, sendableSteps } from '@matrajs/collab'

const editor = createEditor({
  extensions: [...starterKit, collab({ clientId: 'me' }), remoteCursors()] as const,
})

editor.on('change', () => {
  const sendable = sendableSteps(editor)
  if (sendable) socket.send(JSON.stringify(sendable))
})

socket.onmessage = (event) => editor.commands.receiveCollabSteps(JSON.parse(event.data))
```

`Authority` is a plain class with no server attached — run it in a WebSocket
handler, a Durable Object, or a test.

---

### `@matrajs/versions` — Commercial

Snapshots, a real diff between them, and restore as one undo step.

```sh
pnpm add @matrajs/versions
```

| Export | What it is |
|---|---|
| `versions(options)` | The extension. `{ now?, idleMs?, keep?, onChange?, store? }`. |
| `versionList(editor)` | `Version[]` |
| `localVersionStore(key)` | A `VersionStore` on `localStorage`. |
| `diffDocs(a, b)` | `DocDiff` — block-level changes between two documents. |
| `diffWords(a, b)` | `WordRun[]` |
| `blockStarts`, `sizeOf`, `textOf` | The primitives the diff is built from. |
| `versionClasses`, `versionDiffCSS` | Class names and the stylesheet for preview decorations. |
| `Version` | `{ id, label, at, doc, size }` |

Commands: `snapshotVersion(label?)`, `restoreVersion(id)`,
`previewVersion(id | null)`, `forgetVersion(id)`.

```ts
import { createEditor, starterKit } from '@matrajs/core'
import { localVersionStore, versionList, versions } from '@matrajs/versions'

const editor = createEditor({
  extensions: [
    ...starterKit,
    versions({
      idleMs: 30_000,
      keep: 50,
      store: localVersionStore('doc-42'),
      onChange: (state) => render(state.versions, state.diff),
    }),
  ] as const,
})

editor.commands.snapshotVersion('before the rewrite')
editor.commands.previewVersion(versionList(editor)[0].id)
```

`idleMs: null` turns automatic snapshots off and leaves them to
`snapshotVersion`. A version per keystroke is not history, it is a keylogger
with a nicer name. `now` is injected rather than reached for, so a test does not
have to sleep to make two versions differ.


---

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
pnpm packaging   # every built package imports and requires (run after build)
pnpm wiring      # every script on the site finds the markup it asks for
pnpm install:matrix  # pack every package, npm-install it into fresh Vite apps for each framework, build and run them
pnpm facts       # the counts the site prints — tests, adversarial tests, extensions
```

## Status

1.0 — the Matra engine, end to end. Document model, transforms, position
mapping, editor state and the editable view are written from scratch, with
**zero runtime dependencies**. 779 tests, 68 of them adversarial, and every
package is installed with plain npm into a fresh React, Vue, Svelte, Solid
and vanilla Vite app and built there before a release (`pnpm install:matrix`).

An app on the starter kit bundles **30 kB gzipped**, because nothing arrives
that the editor does not use — seventy-nine extensions ship in the package
and none of them is in the bundle until it is in the array. The whole ladder,
from an empty extension array upwards, is measured by `pnpm size` and checked
in CI. It was 25 kB at 0.16; what the five kilobytes bought is listed in
[CHANGELOG.md](./CHANGELOG.md).

Drag and drop landed in 0.9.0: blocks drag with a handle, a line shows where
they will land, and the move is one undo step.

The view passes its tests but has not yet met real IME users on iOS Safari or
Android Chrome. See [ENGINE.md](./ENGINE.md) for where the risk actually sits,
and [harness/ime](./harness/ime) for the page that checks it on a real device.

## Extensions

Everything in the box, and everything free unless marked.

| | | |
|---|---|---|
| **Text** | bold, italic, strike, code, underline, highlight, subscript, superscript, link, **text style**, **kbd** | colour, background, font family and size, as one mark |
| **Blocks** | paragraph, heading, blockquote, code block, horizontal rule, hard break, image, **callout**, **details** | a Notion callout and a collapsible toggle |
| **Embeds** | **YouTube**, **any embed page** in a sandboxed frame, **image resize** with a handle | allowlisted hosts only; the width lands in the HTML |
| **Templates** | **locked blocks**, **fields**, **snippets** | a contract with fixed clauses, a mail merge with no editor, words that expand as typed |
| **Layout** | **columns**, **page break**, **line height**, **text direction** | two to six columns, a real break in print, right-to-left detected from the text |
| **Scholarly** | **footnotes**, **math** inline and display | numbered by position; KaTeX or MathJax plug in, or the source shows |
| **Lists** | bulleted, ordered, **task lists** with real checkboxes | |
| **Tables** | insert, delete, header rows, colspan and rowspan, **add and remove rows and columns, Tab between cells** | spanning cells widen rather than split |
| **Writing** | placeholder, character count, text align, **indent**, **typography**, **emoji shortcodes**, **autolink**, **clear formatting**, **text case**, **invisible characters**, **selection highlight**, **typewriter scrolling**, **autosave**, **smart paste**, **hashtags** | smart quotes, dashes, arrows · `:tada:` · URLs link as you type · tab-separated text becomes a table |
| **Finding** | **search and replace** | incremental: typing rescans one paragraph |
| **Code** | **syntax highlighting** as decorations | a built-in tokeniser, or plug in Shiki, Prism or lowlight |
| **Structure** | **table of contents**, **unique block ids**, **focus class**, **trailing node** | Tiptap charges for the first two |
| **Interchange** | **Markdown in and out**, with no DOM | runs on a server |
| **Dragging** | block drag and drop, **drag handle**, drop cursor, **files dropped or pasted** | Tiptap charges for the handle and the file handler |
| **Review** | threaded comments anchored to ranges | Tiptap charges for these |
| **Menus** | `@` mentions and `/` commands, detection only, **bubble and floating menus** for your element | the popup is yours |
| **Assistance** | **ghost text** completion from any source, **dictation** through the browser's recogniser | Tab takes the suggestion; nothing is sent anywhere the browser does not already send it |
| **Paid** | AI streaming, collaboration with remote cursors, version history | |

Everything Tiptap puts behind its Pro tier that fits in a week — table of
contents, unique ids, the drag handle, comments, the file handler, emoji,
details — is free here. That is the deliberate shape of it: the things that
take a week are free and drive adoption, and the ones that took months are
what you pay for.

### Adding one, step by step

Every extension follows the same four steps. Search and replace, as the
example:

1. **Import it** from `@matrajs/core` — the binding you installed already
   depends on it, so there is nothing to add to `package.json`.
2. **Put it in the array.** Extensions that take options are functions;
   the rest are plain objects.
3. **Call its commands.** They are on `editor.commands`, typed from the
   array, so a typo is a compile error.
4. **Paste its CSS** if it has any. Extensions that draw something export a
   `…CSS` string; the editor ships no appearance of its own.

```ts
import { createEditor, search, searchCSS, starterKit } from '@matrajs/core'

const editor = createEditor({ extensions: [...starterKit, search()] as const })

editor.commands.setSearch({ query: 'colour', wholeWord: true })
editor.commands.nextMatch()              // selects it, so the view scrolls there
editor.commands.replaceMatch('color')
editor.commands.replaceAllMatches('color')   // one undo step
editor.extensionState('search')          // { matches, current, query, … } for a panel

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: searchCSS }))
```

The same shape for the rest: `textStyle` then `editor.commands.setColor('#c00')`;
`callout` then `toggleCallout('warning')`; `...detailsKit` then
`insertDetails()`; `youtube` then `insertYoutube({ src: url })`;
`fileHandler({ accept: ['image/'], onDrop })` then upload in `onDrop` and
insert at `marker.map(pos)`; `...tableKit` then `insertTable(3, 3)` and
`addRowAfter()`. Each is one row in the directory on
[matrajs.com/extensions](https://matrajs.com/extensions), with the line you
would write.

`toMarkdown` and `fromMarkdown` are pure string work rather than a trip through
HTML, so they run in Node, in a worker, and at the edge. Turning a document into
Markdown on a server does not need a DOM polyfill.

## Against the alternatives

Measured, not asserted — see [BENCHMARKS.md](./BENCHMARKS.md) for the method and
what the numbers are not.

| | Matra | Tiptap | Lexical | Slate |
|---|---|---|---|---|
| Bundle, gzipped | **30 kB** | 117 kB | ~35 kB | ~50 kB |
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
Every release is recorded in [CHANGELOG.md](./CHANGELOG.md).

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
