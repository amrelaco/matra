# @matrajs/svelte

Svelte bindings for [Matra](https://matrajs.com): a `use:` action and a store
that follows the editor.

```sh
npm i @matrajs/core @matrajs/svelte
```

```svelte
<script>
  import { starterKit } from '@matrajs/core'
  import { matra } from '@matrajs/svelte'

  const { action, editor, state } = matra({
    extensions: starterKit,
    content: '<p>Hello</p>',
  })
</script>

<button onclick={() => editor.commands.toggleBold()}
        aria-pressed={$state.isActive('bold')}>
  Bold
</button>

<div use:action></div>
```

## What it adds

Svelte already has the right shape for this — an action runs when the element
exists and is told when it goes away — so the binding is thin on purpose. What
it adds over eight lines written inline is the two things people get wrong:

- **The double-mount guard.** A component rendered twice, or an action re-run
  by a hot reload, would otherwise attach a second view to one element, which
  is two carets fighting over it.
- **A store.** `$state` republishes on every change and every selection move,
  so a toolbar's pressed states come from the document rather than from what
  was last clicked.

The editor is created immediately rather than on mount, so `commands`,
`getJSON()` and `getText()` all work before anything is on screen — which is
what a server render and a test both need.

## Svelte 4 and 5

Stores, not runes, so the same package works in both. A rune-only build would
be a version boundary in exchange for nothing: `$state` on a store reads
identically.

## Styling

Matra ships no appearance. See
[the styling guide](https://matrajs.com/docs/styling).

## Licence

MIT.
