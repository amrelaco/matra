import { exitContainerOnEmpty } from '../engine'
import { engine } from '../internal'
import type { Command, NodeDef } from '../types'

export const blockquote = {
  kind: 'node',
  name: 'blockquote' as const,
  content: 'block+',
  group: 'block',
  parseDOM: [{ tag: 'blockquote' }],
  toDOM: () => ['blockquote', 0],
  commands: {
    toggleBlockquote: (ctx) =>
      ctx.inNode('blockquote') ? ctx.lift() : ctx.wrapIn('blockquote'),
    /**
     * Enter on the empty last line of a quote leaves the quote.
     *
     * Without this the quote is a room with no door: every Enter makes another
     * paragraph inside it. Returns false in every other case, so the ordinary
     * Enter behind this binding still runs.
     */
    exitBlockquote: (ctx) => {
      const { tr, schema } = engine(ctx)
      const type = schema.nodes.blockquote
      return type ? exitContainerOnEmpty(tr, type) : false
    },
  },
  keys: { 'Mod-Shift-b': 'toggleBlockquote', Enter: 'exitBlockquote' },
  inputRules: [
    {
      match: /^>\s$/,
      handler: (ctx, _match, range) => ctx.delete(range) && ctx.wrapIn('blockquote'),
    },
  ],
} satisfies NodeDef<{
  toggleBlockquote: Command
  exitBlockquote: Command
}>
