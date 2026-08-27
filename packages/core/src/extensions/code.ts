import type { Command, MarkDef } from '../types'

export const code = {
  kind: 'mark',
  name: 'code' as const,
  // Code is literal: no other mark may apply inside it.
  excludes: '_',
  parseDOM: [{ tag: 'code' }],
  toDOM: () => ['code', 0],
  commands: { toggleCode: (ctx) => ctx.toggleMark('code') },
  keys: { 'Mod-e': 'toggleCode' },
} satisfies MarkDef<{ toggleCode: Command }>
