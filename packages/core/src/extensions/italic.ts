import type { Command, MarkDef } from '../types'

export const italic: MarkDef<{ toggleItalic: Command }> = {
  kind: 'mark',
  name: 'italic',
  parseDOM: [
    { tag: 'em' },
    { tag: 'i' },
    { style: 'font-style', getAttrs: (value) => (value === 'italic' ? null : false) },
  ],
  toDOM: () => ['em', 0],
  commands: { toggleItalic: (ctx) => ctx.toggleMark('italic') },
  keys: { 'Mod-i': 'toggleItalic' },
}
