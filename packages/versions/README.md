# @matrajs/versions

Version history for Matra: snapshots, a real diff between them, and restore as
one undo step.

Part of the paid tier. The core stays MIT.

```sh
npm i @matrajs/versions
```

```ts
import { createEditor, starterKit } from '@matrajs/core'
import { versions, versionDiffCSS } from '@matrajs/versions'

const editor = createEditor({
  extensions: [
    ...starterKit,
    versions({
      // A snapshot when the document has been still for half a minute.
      idleMs: 30_000,
      keep: 50,
      onChange: (state) => render(state.versions, state.diff),
    }),
  ],
})

editor.commands.snapshotVersion('Before the rewrite')
editor.commands.previewVersion(id) // draw the diff over the document
editor.commands.restoreVersion(id) // one transaction, one undo
editor.commands.forgetVersion(id)
```

## What is actually hard here

Keeping copies of a document is a one-liner. Answering **what changed** in the
shape a person reads it is not.

`diffDocs` pairs blocks on their type and text first, so a paragraph that moved
is the same paragraph rather than a deletion and an insertion at two unrelated
places. A removal immediately followed by an addition is read as one block
rewritten, and only then does it go word by word inside it. The result is
"this paragraph is new, that one lost a sentence" rather than a wall of red and
green.

It is guarded, too. The common prefix and suffix are trimmed before any table is
built, which reduces almost every real edit to a handful of blocks; a document
whose thousand blocks were all shuffled falls back to pairing by position, which
is worse than optimal, still correct, and does not lock the tab.

```ts
import { diffDocs } from '@matrajs/versions'

const diff = diffDocs(before, after)
diff.added // 1
diff.blocks // [{ kind: 'same', … }, { kind: 'changed', words: [...] }, …]
```

The diff is exported on its own. It has no opinion about editors and works on
any two Matra documents.

## Previewing

`previewVersion(id)` puts the editor into a comparison against that version and
recomputes the diff on every change, so the highlighting shrinks as you fix
things. Blocks that are still in the document get node decorations; blocks that
were deleted since the snapshot are not in the document to draw on, so they stay
in `state.diff.blocks` for the application to list beside the editor — where the
layout decision belongs.

`versionDiffCSS` is a starting stylesheet for the three classes.

## Where the versions live

Without a store they live until the tab closes, which is undo with labels
rather than history. `store` is a `load` and a `save`:

```ts
import { versions, localVersionStore } from '@matrajs/versions'

versions({ store: localVersionStore(`matra:${documentId}`) })
```

`localVersionStore` is there for the case that needs no server. For anything
real, pass your own — the shape is two functions, and what is behind them is
your database:

```ts
versions({
  store: {
    load: () => cache.get(documentId) ?? null,
    save: (list) => { cache.set(documentId, list); void fetch(`/docs/${documentId}/versions`, {
      method: 'PUT', body: JSON.stringify(list),
    }) },
  },
})
```

`load` is read once when the editor is created, so it is synchronous — hydrate
your cache before you mount, or pass the list you already have. `save` is called
only when the list changes, not on every keystroke, and a store that throws is
logged rather than allowed to take the transaction down with it.

## Restoring

`restoreVersion` replaces the document in one transaction and snapshots where
you were on the way past, labelled `Before restore`. It also calls
`ctx.isolateUndo()`, so it is its own undo step rather than being merged into
whatever sentence was being typed a second earlier.

## Licence

Commercial. See LICENSE.
