# @matrajs/solid

Solid bindings for [Matra](https://matrajs.com): `createMatra`, and a signal
that follows the editor.

```sh
npm i @matrajs/core @matrajs/solid
```

```tsx
import { starterKit } from '@matrajs/core'
import { createMatra } from '@matrajs/solid'

export function Editor() {
  const { editor, mount, state } = createMatra({
    extensions: starterKit,
    content: '<p>Hello</p>',
  })

  return (
    <>
      <button
        onClick={() => editor.commands.toggleBold()}
        aria-pressed={state().isActive('bold')}
      >
        Bold
      </button>
      <div ref={mount} />
    </>
  )
}
```

## What it adds

Solid's reactivity is not a render loop, so there is no external-store shape to
reach for. A signal that bumps on every change is enough: everything reading
`state()` re-runs and nothing else does.

- **`state()` returns the editor itself**, not a copy. A toolbar asks
  `isActive` at render time, and cloning a document to answer that would be the
  expensive way to do nothing. What changes behind it is a version counter,
  because the editor is one object that never changes identity — a signal
  holding it directly would never notify.
- **`onCleanup` destroys it**, so the element is safe to reuse.
- **`mount` is guarded**, because a ref can run twice under a hot reload.

The editor is created immediately rather than on mount, so `commands`,
`getJSON()` and `getText()` all work before anything is on screen — which is
what SSR and a test both need.

## Styling

Matra ships no appearance. See
[the styling guide](https://matrajs.com/docs/styling).

## Licence

MIT.
