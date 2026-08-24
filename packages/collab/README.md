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

`PresenceTracker` keeps other people's cursors inside the document as it
changes. Rendering them is the host's job — the engine has no decoration layer,
and inventing one here would be the wrong place for it.

- Source: https://github.com/amrelaco/matra

MIT.
