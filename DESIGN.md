# Matra — core API design

Status: draft. Nothing published beyond reserved package names.

## Principles

1. **The engine never leaks.** No ProseMirror type appears in a public signature.
   Raw access exists at `editor.unsafe`, is excluded from semver, and every use of
   it is a bug report against this API.
2. **Plain data, plain functions.** Definitions are object literals. Commands are
   ordinary functions. No `this`, no classes, no `.extend()` inheritance chains.
3. **Types are inferred, never declared twice.** Adding an extension to the array
   adds its commands to `editor.commands` with full argument types. There is no
   module augmentation step and no interface to keep in sync.
4. **Async is a first-class problem.** Positions drift while an AI call is in
   flight. The API makes that safe by default rather than leaving it to callers.

## Three primitives

```ts
const heading = defineNode({
  name: 'heading',
  content: 'inline*',
  group: 'block',
  attrs: { level: { default: 1 } },
  parseHTML: [{ tag: 'h1' }, { tag: 'h2' }, { tag: 'h3' }],
  toDOM: (node) => [`h${node.attrs?.level}`, 0],
  commands: {
    setHeading: (ctx, level: 1 | 2 | 3) => ctx.setBlockType('heading', { level }),
  },
  keys: { 'Mod-Alt-1': 'setHeading' },
})

const bold = defineMark({
  name: 'bold',
  parseHTML: [{ tag: 'strong' }, { style: 'font-weight=bold' }],
  toDOM: () => ['strong', 0],
  commands: { toggleBold: (ctx) => ctx.toggleMark('bold') },
  keys: { 'Mod-b': 'toggleBold' },
})

const editor = createEditor({ extensions: [heading, bold] })
editor.commands.setHeading(2)   // typed
editor.commands.setHeading(9)   // compile error
```

`defineExtension` is the third: no schema contribution, just commands, keys,
state and lifecycle. Everything that isn't a node or a mark.

## What differs from TipTap, and why

| TipTap | Matra | Reason |
|---|---|---|
| `addCommands() { return { cmd: () => ({ commands }) => ... } }` | `commands: { cmd: (ctx, ...args) => boolean }` | Three levels of currying collapse to one function. Arguments get real types instead of being erased. |
| `this.editor`, `this.options`, `this.storage` | everything passed as arguments | `this` is bound differently per hook and resists typing. Explicit arguments always work. |
| `Extension.create().extend()` | plain objects, composed | Inheritance chains make it impossible to know what a definition finally contains. |
| Commands merged into one global namespace | same, but collisions are a **compile error** | Two extensions declaring `toggleBold` should not silently shadow. |
| `declare module` augmentation for types | inferred from the extensions array | The augmentation step is the most common source of broken types in TipTap projects. |
| PM types in public API (`Node`, `Mark`, `EditorState`) | plain JSON `DocNode` | Swapping or upgrading the engine becomes possible without a breaking release. |

## Async and position drift

The hard problem in an AI editor: you send a paragraph to a model, the user keeps
typing, the response arrives three seconds later, and every position you captured
is now wrong. Written naively this corrupts documents.

`ctx.mark()` takes a marker that maps positions through every intervening change:

```ts
const rewrite = defineExtension({
  name: 'ai-rewrite',
  commands: {
    rewrite: (ctx) => {
      const marker = ctx.mark()
      const range = ctx.selection
      const text = ctx.doc // read what we need now

      void ai.rewrite(text).then((result) => {
        // the user may have typed anywhere in the meantime
        editor.commands.replaceRange(marker.mapRange(range), result)
      })
      return true
    },
  },
})
```

This is why the AI layer belongs in core's design even though it ships as a
separate package. Retrofitting position mapping later is not possible.

## Open questions

- **Collaboration.** Y.js maps positions through its own type. `PosMarker` and
  Y.js relative positions need to be one concept, not two. Decide before 0.1.
- **`batch()` rollback.** Rolling back when any command returns false is stated
  in the types but interacts with input rules in ways not yet worked out.
- **Node views.** Framework-specific by nature. Core should expose a renderer
  interface that `@matrajs/vue` and `@matrajs/react` implement, but the shape of
  that interface is undecided.
- **Schema ordering.** ProseMirror's first node becomes the doc's default content.
  Currently implicit via `priority`; may need to be explicit.

## Verified

`packages/core/src/types.test-d.ts` is a compile-time test. It asserts that valid
calls typecheck and that wrong arity, wrong argument types, and unknown commands
all fail. Run with `tsc --noEmit --strict`.
