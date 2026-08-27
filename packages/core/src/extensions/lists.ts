import { liftListItem, sinkListItem, splitListItem } from '../engine/list-commands'
import { engine } from '../internal'
import type { Command, NodeDef } from '../types'

/** List editing works on the transaction the command is already building. */
const runList =
  (name: 'split' | 'lift' | 'sink'): Command =>
  (ctx) => {
    const { state, tr } = engine(ctx)
    const itemType = state.schema.nodes.listItem
    if (!itemType) return false
    const apply =
      name === 'split' ? splitListItem : name === 'lift' ? liftListItem : sinkListItem
    return apply(state, tr, itemType)
  }

export const listItem = {
  kind: 'node',
  name: 'listItem' as const,
  listItem: true,
  content: 'paragraph block*',
  parseDOM: [{ tag: 'li' }],
  toDOM: () => ['li', 0],
  commands: {
    splitListItem: runList('split'),
    liftListItem: runList('lift'),
    sinkListItem: runList('sink'),
  },
  keys: {
    Enter: 'splitListItem',
    Tab: 'sinkListItem',
    'Shift-Tab': 'liftListItem',
  },
} satisfies NodeDef<{
  splitListItem: Command
  liftListItem: Command
  sinkListItem: Command
}>

export const bulletList = {
  kind: 'node',
  name: 'bulletList' as const,
  content: 'listItem+',
  group: 'block',
  parseDOM: [{ tag: 'ul' }],
  toDOM: () => ['ul', 0],
  commands: {
    toggleBulletList: (ctx) =>
      ctx.inNode('bulletList') ? ctx.lift() : ctx.wrapIn('bulletList'),
  },
  keys: { 'Mod-Shift-8': 'toggleBulletList' },
  inputRules: [
    {
      match: /^\s*([-+*])\s$/,
      handler: (ctx, _match, range) => ctx.delete(range) && ctx.wrapIn('bulletList'),
    },
  ],
} satisfies NodeDef<{ toggleBulletList: Command }>

export const orderedList = {
  kind: 'node',
  name: 'orderedList' as const,
  content: 'listItem+',
  group: 'block',
  attrs: { start: { default: 1 } },
  parseDOM: [
    {
      tag: 'ol',
      getAttrs: (dom) => ({ start: Number((dom as Element).getAttribute('start') ?? 1) || 1 }),
    },
  ],
  toDOM: (node) => {
    const start = (node.attrs?.start as number) ?? 1
    return ['ol', start === 1 ? {} : { start }, 0]
  },
  commands: {
    toggleOrderedList: (ctx) =>
      ctx.inNode('orderedList') ? ctx.lift() : ctx.wrapIn('orderedList'),
  },
  keys: { 'Mod-Shift-9': 'toggleOrderedList' },
  inputRules: [
    {
      match: /^\s*(\d+)\.\s$/,
      handler: (ctx, match, range) =>
        ctx.delete(range) && ctx.wrapIn('orderedList', { start: Number(match[1]) || 1 }),
    },
  ],
} satisfies NodeDef<{ toggleOrderedList: Command }>
