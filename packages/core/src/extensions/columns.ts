import type { Node, ResolvedPos, Schema } from '../engine/model'
import { engine } from '../internal'
import type { Command, NodeDef } from '../types'

const LIST = 'columnList'
const COLUMN = 'column'

/** Fewer than two is not columns; more than six is not readable. */
const MIN = 2
const MAX = 6

/**
 * The depth of the column the caret is in, or -1.
 *
 * Only a column list holds columns, so the list is always one level up — the
 * two are found together, and a caret in nested columns finds the innermost.
 */
function columnDepth($from: ResolvedPos): number {
  for (let depth = $from.depth; depth > 1; depth--) {
    if ($from.node(depth).type.name === COLUMN) return depth
  }
  return -1
}

/**
 * An empty column: one paragraph to type into.
 *
 * Built explicitly rather than with `createAndFill`, which takes the first
 * block type the schema offers — and, with the columns declared before the
 * paragraph, that is a column list, whose first column would need filling.
 */
function emptyColumn(schema: Schema): Node | null {
  const type = schema.nodes[COLUMN]
  if (!type) return null
  const paragraph = schema.nodes.paragraph
  return paragraph ? type.create(null, paragraph.create()) : type.createAndFill()
}

/**
 * One column of a column list. Holds blocks, so a column can carry a list, a
 * table or an image rather than only text.
 */
export const column = {
  kind: 'node',
  name: COLUMN,
  content: 'block+',
  parseDOM: [{ tag: 'div[data-column]' }],
  toDOM: () => ['div', { 'data-column': '', class: 'matra-column' }, 0],
} satisfies NodeDef

/**
 * Side-by-side columns.
 *
 * Two nodes, deliberately plain: a list holds columns and a column holds
 * blocks, which is the whole of the structure. The layout is a CSS grid on
 * the list, so the document says how many columns there are and the page
 * decides how wide each one is.
 *
 * Wrapping a block into columns keeps that block as the first column and
 * makes the rest empty, and taking the columns away lays every column's
 * blocks out in order — so a document that was put into columns and taken
 * out again reads as it did.
 *
 * ```ts
 * editor.commands.setColumns(3)
 * editor.commands.addColumn()
 * editor.commands.removeColumn()
 * editor.commands.unsetColumns()
 * ```
 */
export const columnList = {
  kind: 'node',
  name: LIST,
  content: 'column column+',
  group: 'block',
  parseDOM: [{ tag: 'div[data-columns]' }],
  toDOM: () => ['div', { 'data-columns': '', class: 'matra-columns' }, 0],
  commands: {
    /** Put the block the caret is in into the first of `count` columns. */
    setColumns: (ctx, count = 2) => {
      if (!Number.isInteger(count) || count < MIN || count > MAX) return false
      const { tr, schema } = engine(ctx)
      const listType = schema.nodes[LIST]
      const columnType = schema.nodes[COLUMN]
      if (!listType || !columnType) return false
      const { $from, from, to } = tr.selection
      if ($from.depth === 0 || columnDepth($from) !== -1) return false

      const columns = [columnType.create(null, $from.node(1))]
      for (let i = 1; i < count; i++) {
        const empty = emptyColumn(schema)
        if (!empty) return false
        columns.push(empty)
      }
      const after = $from.after(1)
      tr.replaceWith($from.before(1), after, listType.create(null, columns))
      // The block moved two positions in, past the list's and the column's
      // opening borders · the selection goes with it while it fits.
      tr.selectAt(from + 2, to <= after ? to + 2 : from + 2)
      return true
    },

    /** Take the list away and leave every column's blocks in order. */
    unsetColumns: (ctx) => {
      const { tr } = engine(ctx)
      const { $from, from, to } = tr.selection
      const depth = columnDepth($from)
      if (depth === -1) return false
      const list = $from.node(depth - 1)
      const blocks: Node[] = []
      for (let i = 0; i < list.childCount; i++) {
        for (const block of list.child(i).content) blocks.push(block)
      }
      const columnEnd = $from.after(depth)
      tr.replaceWith($from.before(depth - 1), $from.after(depth - 1), blocks)
      // Every column before this one shed its two borders, as did this one
      // and the list: the caret comes back by two per column, plus two.
      const shift = 2 * ($from.index(depth - 1) + 1)
      tr.selectAt(from - shift, to <= columnEnd ? to - shift : from - shift)
      return true
    },

    /** One more empty column at the end, with the caret in it. */
    addColumn: (ctx) => {
      const { tr, schema } = engine(ctx)
      const $from = tr.selection.$from
      const depth = columnDepth($from)
      if (depth === -1) return false
      if ($from.node(depth - 1).childCount >= MAX) return false
      const empty = emptyColumn(schema)
      if (!empty) return false
      const end = $from.end(depth - 1)
      tr.insert(end, empty)
      tr.selectAt(end + 2)
      return true
    },

    /** Remove the column the caret is in — and the list, when one would remain. */
    removeColumn: (ctx) => {
      const { tr } = engine(ctx)
      const $from = tr.selection.$from
      const depth = columnDepth($from)
      if (depth === -1) return false
      const list = $from.node(depth - 1)
      const index = $from.index(depth - 1)
      const before = $from.before(depth)

      if (list.childCount <= MIN) {
        // A column cannot stand alone, so the one that is left steps out.
        const kept = list.child(index === 0 ? 1 : 0)
        const start = $from.before(depth - 1)
        tr.replaceWith(start, $from.after(depth - 1), kept.content)
        tr.selectAt(start + 1)
        return true
      }

      tr.delete(before, $from.after(depth))
      // Into the column that took its place, or the last one when it was last.
      tr.selectAt(index < list.childCount - 1 ? before + 2 : before - 2)
      return true
    },
  },
} satisfies NodeDef<{
  setColumns: Command<[count?: number]>
  unsetColumns: Command
  addColumn: Command
  removeColumn: Command
}>

/** Both nodes, in the order a schema wants them. */
export const columnsKit = [columnList, column] as const

/** A grid that gives every column the same share of the width. */
export const columnsCSS = `
.matra-columns { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 1rem; }
.matra-column { min-width: 0; }
`
