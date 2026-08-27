import type { Command, MarkDef } from '../types'

export const subscript = {
  kind: 'mark',
  name: 'subscript' as const,
  // Text cannot be above and below the line at once.
  excludes: 'superscript',
  parseDOM: [{ tag: 'sub' }],
  toDOM: () => ['sub', 0],
  commands: { toggleSubscript: (ctx) => ctx.toggleMark('subscript') },
} satisfies MarkDef<{ toggleSubscript: Command }>

export const superscript = {
  kind: 'mark',
  name: 'superscript' as const,
  excludes: 'subscript',
  parseDOM: [{ tag: 'sup' }],
  toDOM: () => ['sup', 0],
  commands: { toggleSuperscript: (ctx) => ctx.toggleMark('superscript') },
} satisfies MarkDef<{ toggleSuperscript: Command }>
