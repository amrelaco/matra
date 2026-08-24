# @matrajs/collab

Collaborative editing for Matra. No CRDT, no dependency — the engine can
already rebase a step over someone else's edit, so this is a version counter
and a transport on top of that.

```bash
npm i @matrajs/core @matrajs/collab
```

```ts
import { collab, sendableSteps, getVersion } from '@matrajs/collab'

const editor = createEditor({
  extensions: [...starterKit, collab({ clientId })],
  content,
})

// Send what we have; the authority accepts only if we are current.
const sendable = sendableSteps(editor)
if (sendable) {
  const accepted = await post(sendable)
  if (accepted) editor.commands.confirmCollabSteps(sendable.steps.length)
}

// Pull what we missed. Local work is rewound, remote steps applied, then local
// work replayed on top — so unsent edits survive someone else's.
editor.commands.receiveCollabSteps(await since(getVersion(editor)))
```

`Authority` is the server half, deliberately transport-free so the same object
works over WebSocket, HTTP polling, or an in-memory channel in a test.

`remoteCursors()` draws everyone else's caret and selection, as decorations
rather than as document content — so nothing about presence travels with a
copy, an export, or an undo.

```ts
import { collab, remoteCursors, remoteCursorCSS } from '@matrajs/collab'

const editor = createEditor({
  extensions: [...starterKit, collab({ clientId }), remoteCursors()],
})

// Whatever your transport delivers.
socket.on('presence', (p) => editor.commands.setPresence(p))
socket.on('left', (id) => editor.commands.removePresence(id))
```

A caret arrives as a position in the *sender's* document, and is wrong the
moment anything is typed locally. Each one is mapped through the same steps the
local document went through, which is the only thing that keeps a caret on the
word it was actually next to — clamping it to the document size, the obvious
shortcut, silently points every cursor at the wrong place.

Colours come from `colorFor(clientId)`, derived rather than assigned, so two
clients that never speak still agree on what colour a third person is. Drop in
`remoteCursorCSS` for enough styling to see a caret, or write your own against
`.matra-remote-cursor`, `.matra-remote-cursor-label` and
`.matra-remote-selection`.

- Source: https://github.com/amrelaco/matra

MIT.
