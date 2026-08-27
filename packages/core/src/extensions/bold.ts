import type { Command, MarkDef } from '../types'

const toggleBold: Command = (ctx) => ctx.toggleMark('bold')
const setBold: Command = (ctx) => ctx.addMark('bold')
const unsetBold: Command = (ctx) => ctx.removeMark('bold')

export const bold = {
  kind: 'mark',
  name: 'bold' as const,
  parseDOM: [
    { tag: 'strong' },
    { tag: 'b' },
    {
      style: 'font-weight',
      getAttrs: (value) => (/^(bold(er)?|[5-9]\d{2})$/.test(value as string) ? null : false),
    },
  ],
  toDOM: () => ['strong', 0],
  commands: { toggleBold, setBold, unsetBold },
  keys: { 'Mod-b': 'toggleBold' },
} satisfies MarkDef<{
  toggleBold: Command
  setBold: Command
  unsetBold: Command
}>
