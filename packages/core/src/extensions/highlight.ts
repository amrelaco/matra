import type { Command, MarkDef } from '../types'

/** Only named colours and hex are allowed — a style attribute is an injection surface. */
const SAFE_COLOUR = /^(#[0-9a-f]{3,8}|[a-z]+)$/i

export const highlight = {
  kind: 'mark',
  name: 'highlight' as const,
  attrs: { color: { default: null } },
  parseDOM: [
    {
      tag: 'mark',
      getAttrs: (dom) => {
        const color = (dom as Element).getAttribute('data-color')
        return { color: color && SAFE_COLOUR.test(color) ? color : null }
      },
    },
  ],
  toDOM: (mark) => {
    const color = mark.attrs?.color
    return typeof color === 'string' && SAFE_COLOUR.test(color)
      ? ['mark', { 'data-color': color, style: `background-color: ${color}` }, 0]
      : ['mark', 0]
  },
  commands: {
    toggleHighlight: (ctx, color) => ctx.toggleMark('highlight', { color: color ?? null }),
    unsetHighlight: (ctx) => ctx.removeMark('highlight'),
  },
  keys: { 'Mod-Shift-h': 'toggleHighlight' },
} satisfies MarkDef<{
  toggleHighlight: Command<[color?: string]>
  unsetHighlight: Command
}>
