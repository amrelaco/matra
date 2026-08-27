import type { Command, NodeDef } from '../types'

export const hardBreak = {
  kind: 'node',
  name: 'hardBreak' as const,
  group: 'inline',
  inline: true,
  selectable: false,
  parseDOM: [{ tag: 'br' }],
  toDOM: () => ['br'],
  commands: { insertHardBreak: (ctx) => ctx.insert({ type: 'hardBreak' }) },
  keys: { 'Shift-Enter': 'insertHardBreak' },
} satisfies NodeDef<{ insertHardBreak: Command }>
