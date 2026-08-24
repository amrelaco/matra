import type { Command, MarkDef } from '../types'

export const subscript: MarkDef<{ toggleSubscript: Command }> = {
  kind: 'mark',
  name: 'subscript',
  // Text cannot be above and below the line at once.
  excludes: 'superscript',
  parseDOM: [{ tag: 'sub' }],
  toDOM: () => ['sub', 0],
  commands: { toggleSubscript: (ctx) => ctx.toggleMark('subscript') },
}

export const superscript: MarkDef<{ toggleSuperscript: Command }> = {
  kind: 'mark',
  name: 'superscript',
  excludes: 'subscript',
  parseDOM: [{ tag: 'sup' }],
  toDOM: () => ['sup', 0],
  commands: { toggleSuperscript: (ctx) => ctx.toggleMark('superscript') },
}
