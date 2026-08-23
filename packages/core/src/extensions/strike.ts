import type { Command, MarkDef } from '../types'

export const strike: MarkDef<{ toggleStrike: Command }> = {
  kind: 'mark',
  name: 'strike',
  parseDOM: [
    { tag: 's' },
    { tag: 'del' },
    {
      style: 'text-decoration',
      getAttrs: (value) => (value === 'line-through' ? null : false),
    },
  ],
  toDOM: () => ['s', 0],
  commands: { toggleStrike: (ctx) => ctx.toggleMark('strike') },
  keys: { 'Mod-Shift-x': 'toggleStrike' },
}
