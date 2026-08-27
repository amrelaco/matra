import type { Command, NodeDef } from '../types'

const setParagraph: Command = (ctx) => ctx.setBlockType('paragraph')

export const paragraph = {
  kind: 'node',
  name: 'paragraph' as const,
  content: 'inline*',
  group: 'block',
  parseDOM: [{ tag: 'p' }],
  toDOM: () => ['p', 0],
  commands: { setParagraph },
  keys: { 'Mod-Alt-0': 'setParagraph' },
} satisfies NodeDef<{ setParagraph: Command }>
