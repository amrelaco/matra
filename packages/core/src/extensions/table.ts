import { engine } from '../internal'
import type { Command, DocNode, NodeDef } from '../types'

/**
 * Tables.
 *
 * Three node types, deliberately plain: a table holds rows, a row holds cells,
 * a cell holds blocks. Column widths live on the cell rather than a separate
 * colgroup, so a cell always carries everything needed to render it.
 */

export const table: NodeDef<{
  insertTable: Command<[rows?: number, cols?: number]>
  deleteTable: Command
}> = {
  kind: 'node',
  name: 'table',
  content: 'tableRow+',
  group: 'block',
  parseDOM: [{ tag: 'table' }],
  toDOM: () => ['table', ['tbody', 0]],
  commands: {
    insertTable: (ctx, rows = 3, cols = 3) => {
      if (rows < 1 || cols < 1) return false
      // A table is a block, so it goes after the block the caret is in rather
      // than inside it — inserting at the caret would break the schema.
      const { tr } = engine(ctx)
      const $from = tr.selection.$from
      const at = $from.parent.isTextblock ? $from.after($from.depth) : tr.selection.from
      return ctx.insert(buildTable(rows, cols), at as never)
    },
    deleteTable: (ctx) => {
      const { tr } = engine(ctx)
      const $from = tr.selection.$from
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name !== 'table') continue
        return ctx.delete({
          from: ($from.start(depth) - 1) as never,
          to: ($from.end(depth) + 1) as never,
        })
      }
      return false
    },
  },
}

export const tableRow: NodeDef = {
  kind: 'node',
  name: 'tableRow',
  content: '(tableCell | tableHeader)+',
  parseDOM: [{ tag: 'tr' }],
  toDOM: () => ['tr', 0],
}

const cellAttrs = {
  colspan: { default: 1 },
  rowspan: { default: 1 },
  colwidth: { default: null },
}

function cellAttrsFrom(dom: Element): Record<string, unknown> {
  const width = dom.getAttribute('data-colwidth')
  return {
    colspan: Number(dom.getAttribute('colspan') ?? 1) || 1,
    rowspan: Number(dom.getAttribute('rowspan') ?? 1) || 1,
    colwidth: width ? Number(width) || null : null,
  }
}

function cellDOM(tag: string, attrs: Record<string, unknown> | undefined) {
  const out: Record<string, unknown> = {}
  const colspan = Number(attrs?.colspan ?? 1)
  const rowspan = Number(attrs?.rowspan ?? 1)
  if (colspan > 1) out.colspan = colspan
  if (rowspan > 1) out.rowspan = rowspan
  if (attrs?.colwidth) {
    out['data-colwidth'] = attrs.colwidth
    out.style = `width: ${Number(attrs.colwidth)}px`
  }
  return [tag, out, 0] as [string, Record<string, unknown>, number]
}

export const tableCell: NodeDef = {
  kind: 'node',
  name: 'tableCell',
  content: 'block+',
  attrs: cellAttrs,
  parseDOM: [{ tag: 'td', getAttrs: (dom) => cellAttrsFrom(dom as Element) }],
  toDOM: (node) => cellDOM('td', node.attrs),
}

export const tableHeader: NodeDef = {
  kind: 'node',
  name: 'tableHeader',
  content: 'block+',
  attrs: cellAttrs,
  parseDOM: [{ tag: 'th', getAttrs: (dom) => cellAttrsFrom(dom as Element) }],
  toDOM: (node) => cellDOM('th', node.attrs),
}

/** A table with a header row, which is what people mean by "insert table". */
function buildTable(rows: number, cols: number): DocNode {
  const cell = (type: string): DocNode => ({
    type,
    content: [{ type: 'paragraph' }],
  })

  const header: DocNode = {
    type: 'tableRow',
    content: Array.from({ length: cols }, () => cell('tableHeader')),
  }
  const body = Array.from({ length: rows - 1 }, () => ({
    type: 'tableRow',
    content: Array.from({ length: cols }, () => cell('tableCell')),
  }))

  return { type: 'table', content: [header, ...body] }
}

/** All four table node types, in the order a schema wants them. */
export const tableKit = [table, tableRow, tableCell, tableHeader] as const
