import type { Command, NodeDef } from '../types'

export type CalloutType = 'info' | 'note' | 'tip' | 'warning' | 'danger' | 'success'

const TYPES: CalloutType[] = ['info', 'note', 'tip', 'warning', 'danger', 'success']
const isType = (value: unknown): value is CalloutType => TYPES.includes(value as CalloutType)

/** One character, or nothing: an icon is not the place for markup. */
const SAFE_EMOJI =
  /^\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Extended_Pictographic}){0,7}$/u

/**
 * A callout — a Notion block, an admonition, an aside with a colour.
 *
 * Holds blocks, so a callout can carry a list or a code sample, and carries a
 * type for the colour and an optional emoji for the icon. The icon is outside
 * the editable content, so the caret cannot land in it.
 */
export const callout = {
  kind: 'node',
  name: 'callout' as const,
  content: 'block+',
  group: 'block',
  attrs: {
    type: { default: 'info' },
    emoji: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-callout]',
      getAttrs: (dom) => {
        const element = dom as Element
        const type = element.getAttribute('data-callout')
        const emoji = element.getAttribute('data-emoji')
        return {
          type: isType(type) ? type : 'info',
          emoji: emoji && SAFE_EMOJI.test(emoji) ? emoji : null,
        }
      },
    },
  ],
  toDOM: (node) => {
    const type = isType(node.attrs?.type) ? node.attrs.type : 'info'
    const emoji = node.attrs?.emoji
    const icon = typeof emoji === 'string' && SAFE_EMOJI.test(emoji) ? emoji : null
    const attrs: Record<string, string> = {
      'data-callout': type,
      class: `matra-callout matra-callout-${type}`,
    }
    if (icon) attrs['data-emoji'] = icon
    if (!icon) return ['div', attrs, ['div', { class: 'matra-callout-body' }, 0]]
    return [
      'div',
      attrs,
      ['span', { class: 'matra-callout-icon', contenteditable: 'false' }, icon],
      ['div', { class: 'matra-callout-body' }, 0],
    ]
  },
  commands: {
    toggleCallout: (ctx, type?: CalloutType) => {
      if (ctx.inNode('callout')) return ctx.lift()
      return ctx.wrapIn('callout', { type: isType(type) ? type : 'info' })
    },
    setCalloutType: (ctx, type) =>
      isType(type) ? ctx.setNodeAttrs('callout', { type }) : false,
    setCalloutEmoji: (ctx, emoji) =>
      emoji === null || SAFE_EMOJI.test(emoji) ? ctx.setNodeAttrs('callout', { emoji }) : false,
  },
} satisfies NodeDef<{
  toggleCallout: Command<[type?: CalloutType]>
  setCalloutType: Command<[type: CalloutType]>
  setCalloutEmoji: Command<[emoji: string | null]>
}>

/** Enough styling to tell the types apart. */
export const calloutCSS = `
.matra-callout { display: flex; gap: 0.6em; padding: 0.75em 1em; border-radius: 8px; border-left: 3px solid var(--matra-callout-line, #4b6bfb); background: var(--matra-callout-bg, rgba(75, 107, 251, 0.08)); }
.matra-callout-body { flex: 1 1 auto; min-width: 0; }
.matra-callout-icon { user-select: none; line-height: 1.5; }
.matra-callout-warning { --matra-callout-line: #e0a100; --matra-callout-bg: rgba(224, 161, 0, 0.1); }
.matra-callout-danger { --matra-callout-line: #d64545; --matra-callout-bg: rgba(214, 69, 69, 0.1); }
.matra-callout-success { --matra-callout-line: #2e9e5b; --matra-callout-bg: rgba(46, 158, 91, 0.1); }
.matra-callout-tip { --matra-callout-line: #0f9d9d; --matra-callout-bg: rgba(15, 157, 157, 0.1); }
.matra-callout-note { --matra-callout-line: #8a8a8a; --matra-callout-bg: rgba(138, 138, 138, 0.1); }
`
