import type { Command, NodeDef } from '../types'

export const horizontalRule: NodeDef<{ insertHorizontalRule: Command }> = {
  kind: 'node',
  name: 'horizontalRule',
  group: 'block',
  atom: true,
  parseDOM: [{ tag: 'hr' }],
  toDOM: () => ['hr'],
  commands: {
    insertHorizontalRule: (ctx) => ctx.insert({ type: 'horizontalRule' }),
  },
  inputRules: [
    {
      match: /^(?:---|___|\*\*\*)\s$/,
      handler: (ctx, _match, range) => ctx.replace(range, { type: 'horizontalRule' }),
    },
  ],
}
