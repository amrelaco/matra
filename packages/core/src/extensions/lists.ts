import { liftListItem, sinkListItem, splitListItem, toggleList } from '../engine/list-commands'
import { engine } from '../internal'
import type { Command, NodeDef } from '../types'

/** The list button, for a list of `list` made of `item`. */
export const listToggle =
  (list: string, item: string): Command =>
  (ctx) => {
    const { state, tr } = engine(ctx)
    const listType = state.schema.nodes[list]
    const itemType = state.schema.nodes[item]
    return !!listType && !!itemType && toggleList(tr, listType, itemType)
  }

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
    splitListItem: /* @__PURE__ */ runList('split'),
    liftListItem: /* @__PURE__ */ runList('lift'),
    sinkListItem: /* @__PURE__ */ runList('sink'),
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
    toggleBulletList: /* @__PURE__ */ listToggle('bulletList', 'listItem'),
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
    toggleOrderedList: /* @__PURE__ */ listToggle('orderedList', 'listItem'),
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
