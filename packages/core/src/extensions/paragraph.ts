import type { Command, NodeDef } from '../types'

const setParagraph: Command = (ctx) => ctx.setBlockType('paragraph')

export const paragraph: NodeDef<{ setParagraph: Command }> = {
  kind: 'node',
  name: 'paragraph',
  content: 'inline*',
  group: 'block',
  parseDOM: [{ tag: 'p' }],
  toDOM: () => ['p', 0],
  commands: { setParagraph },
  keys: { 'Mod-Alt-0': 'setParagraph' },
}
