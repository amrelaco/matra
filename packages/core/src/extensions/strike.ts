import type { Command, MarkDef } from '../types'

export const strike = {
  kind: 'mark',
  name: 'strike' as const,
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
} satisfies MarkDef<{ toggleStrike: Command }>
