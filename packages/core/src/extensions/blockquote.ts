import type { Command, NodeDef } from '../types'

export const blockquote: NodeDef<{
  toggleBlockquote: Command
}> = {
  kind: 'node',
  name: 'blockquote',
  content: 'block+',
  group: 'block',
  parseDOM: [{ tag: 'blockquote' }],
  toDOM: () => ['blockquote', 0],
  commands: {
    toggleBlockquote: (ctx) =>
      ctx.inNode('blockquote') ? ctx.lift() : ctx.wrapIn('blockquote'),
  },
  keys: { 'Mod-Shift-b': 'toggleBlockquote' },
  inputRules: [
    {
      match: /^>\s$/,
      handler: (ctx, _match, range) => ctx.delete(range) && ctx.wrapIn('blockquote'),
    },
  ],
}
