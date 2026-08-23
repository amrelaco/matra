import type { Command, NodeDef } from '../types'

export const hardBreak: NodeDef<{ insertHardBreak: Command }> = {
  kind: 'node',
  name: 'hardBreak',
  group: 'inline',
  inline: true,
  selectable: false,
  parseDOM: [{ tag: 'br' }],
  toDOM: () => ['br'],
  commands: { insertHardBreak: (ctx) => ctx.insert({ type: 'hardBreak' }) },
  keys: { 'Shift-Enter': 'insertHardBreak' },
}
