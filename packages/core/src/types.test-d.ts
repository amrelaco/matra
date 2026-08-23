/**
 * Type-level tests. These never run — `pnpm typecheck` is the assertion.
 * They exist to prove the two claims the product is sold on.
 */
import { createEditor } from './editor'
import { bold, document as doc, paragraph, text } from './extensions'
import type { Command, MarkDef } from './types'

const editor = createEditor({ extensions: [doc, paragraph, text, bold] as const })

// Claim 1: commands are inferred from the array you pass — no generics, no
// module augmentation, no registry.
editor.commands.toggleBold()
editor.commands.setBold()
editor.commands.select({ from: 0 as never, to: 1 as never })

// @ts-expect-error — a command no extension defines does not exist.
editor.commands.toggleItalic()

// Claim 2: argument types survive the binding, minus the injected ctx.
const highlight: MarkDef<{ setHighlight: Command<[color: string]> }> = {
  kind: 'mark',
  name: 'highlight',
  commands: { setHighlight: (ctx, color) => ctx.addMark('highlight', { color }) },
}

const themed = createEditor({ extensions: [doc, paragraph, text, highlight] as const })
themed.commands.setHighlight('yellow')

// @ts-expect-error — wrong argument type is caught at the call site.
themed.commands.setHighlight(42)

// @ts-expect-error — ctx is injected by the engine, never passed by the caller.
themed.commands.setHighlight({} as never, 'yellow')
