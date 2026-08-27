import type { Command, MarkDef } from '../types'

export const underline = {
  kind: 'mark',
  name: 'underline' as const,
  parseDOM: [
    { tag: 'u' },
    {
      style: 'text-decoration',
      getAttrs: (value) => (value === 'underline' ? null : false),
    },
  ],
  toDOM: () => ['u', 0],
  commands: { toggleUnderline: (ctx) => ctx.toggleMark('underline') },
  keys: { 'Mod-u': 'toggleUnderline' },
} satisfies MarkDef<{ toggleUnderline: Command }>
