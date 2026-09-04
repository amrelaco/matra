import type { Node, NodeType, ResolvedPos } from '../engine/model'
import type { Transaction } from '../engine/state'
import { engine } from '../internal'
import type { Command, DocNode, NodeDef } from '../types'

/**
 * Tables.
 *
 * Three node types, deliberately plain: a table holds rows, a row holds cells,
 * a cell holds blocks. Column widths live on the cell rather than a separate
 * colgroup, so a cell always carries everything needed to render it.
 *
 * Rows and columns are added and removed through a grid built from the table
 * on demand — each cell placed at the row and column it occupies, spans
 * filled in — so a cell spanning the boundary a new column crosses is
 * widened rather than split, the way a spreadsheet does it.
 */

/** One cell, placed. */
interface Cell {
  /** Absolute position of the cell node. */
  pos: number
  row: number
  col: number
  colspan: number
  rowspan: number
  node: Node
}

interface Grid {
  width: number
  height: number
  /** Every cell, in document order. */
  cells: Cell[]
  /** `slots[row][col]` is the cell covering that square. */
  slots: Cell[][]
  /** Absolute position of each row node. */
  rowPos: number[]
}

const span = (value: unknown): number => {
  const n = Number(value)
  return Number.isInteger(n) && n > 1 ? n : 1
}

function buildGrid(table: Node, tableStart: number): Grid {
  const rows = table.content.content
  const height = rows.length
  const slots: Cell[][] = []
  const cells: Cell[] = []
  const rowPos: number[] = []
  let width = 0

  let pos = tableStart
  for (let r = 0; r < height; r++) {
    const row = rows[r] as Node
    rowPos.push(pos)
    if (!slots[r]) slots[r] = []
    const line = slots[r] as Cell[]
    let col = 0
    let cellPos = pos + 1
    for (const node of row.content) {
      while (line[col]) col++
      const cell: Cell = {
        pos: cellPos,
        row: r,
        col,
        colspan: span(node.attrs.colspan),
        rowspan: Math.min(span(node.attrs.rowspan), height - r),
        node,
      }
      cells.push(cell)
      for (let dr = 0; dr < cell.rowspan; dr++) {
        if (!slots[r + dr]) slots[r + dr] = []
        const target = slots[r + dr] as Cell[]
        for (let dc = 0; dc < cell.colspan; dc++) target[col + dc] = cell
      }
      col += cell.colspan
      cellPos += node.nodeSize
    }
    if (line.length > width) width = line.length
    pos += row.nodeSize
  }
  return { width, height, cells, slots, rowPos }
}

/** Where the caret is: the table, its start, and the cell. */
interface Place {
  table: Node
  tableStart: number
  grid: Grid
  cell: Cell
}

function locate(tr: Transaction): Place | null {
  const $from: ResolvedPos = tr.selection.$from
  let tableDepth = -1
  let cellDepth = -1
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name
    if ((name === 'tableCell' || name === 'tableHeader') && cellDepth === -1) cellDepth = depth
    if (name === 'table') {
      tableDepth = depth
      break
    }
  }
  if (tableDepth === -1 || cellDepth === -1) return null
  const table = $from.node(tableDepth)
  const tableStart = $from.start(tableDepth)
  const grid = buildGrid(table, tableStart)
  const cellPos = $from.before(cellDepth)
  const cell = grid.cells.find((entry) => entry.pos === cellPos)
  return cell ? { table, tableStart, grid, cell } : null
}

/** An empty cell of a type, with the paragraph a cell must hold. */
function emptyCell(type: NodeType, attrs?: Record<string, unknown>): Node | null {
  const kept: Record<string, unknown> = {}
  if (attrs?.colwidth) kept.colwidth = attrs.colwidth
  return type.createAndFill(kept)
}

const isHeader = (cell: Cell) => cell.node.type.name === 'tableHeader'

/** The first text position inside a cell. */
const intoCell = (tr: Transaction, pos: number) => tr.selectAt(pos + 2)

// --- rows ---------------------------------------------------------------

function addRow(tr: Transaction, place: Place, after: boolean): boolean {
  const { grid, cell } = place
  const boundary = after ? cell.row + cell.rowspan : cell.row
  const rowType = place.table.type.schema.nodes.tableRow
  if (!rowType) return false

  // Cells for the new row take their type from the row it sits beside · a row
  // added after the header row is a body row, whether or not one exists yet.
  let reference = cell.row
  if (after) {
    const own = grid.slots[cell.row] ?? []
    const allHeaders = own.length > 0 && own.every((entry) => isHeader(entry))
    if (allHeaders) reference = boundary < grid.height ? boundary : -1
  }
  const above = boundary > 0 ? grid.slots[boundary - 1] : undefined
  const below = boundary < grid.height ? grid.slots[boundary] : undefined

  const widen = new Set<Cell>()
  const cells: Node[] = []
  for (let col = 0; col < grid.width; col++) {
    const up = above?.[col]
    const down = below?.[col]
    if (up && up === down) {
      // Spans the boundary: it grows by one row rather than being cut.
      widen.add(up)
      continue
    }
    const ref = reference === -1 ? undefined : grid.slots[reference]?.[col]
    const type = ref ? ref.node.type : place.table.type.schema.nodes.tableCell
    if (!type) return false
    const made = emptyCell(type, (ref ?? above?.[col])?.node.attrs)
    if (!made) return false
    cells.push(made)
  }
  if (!cells.length && !widen.size) return false

  const insertAt =
    boundary < grid.height
      ? (grid.rowPos[boundary] as number)
      : place.tableStart + place.table.content.size
  if (cells.length) tr.insert(insertAt, rowType.create(null, cells))
  // Widened cells all start above the insertion, so their positions hold.
  for (const wide of widen) tr.setNodeAttrs(wide.pos, { rowspan: wide.rowspan + 1 })
  return true
}

function deleteRow(tr: Transaction, place: Place): boolean {
  const { grid, cell, table, tableStart } = place
  if (grid.height <= 1) {
    tr.delete(tableStart - 1, tableStart + table.nodeSize - 1)
    return true
  }
  const row = cell.row
  const rowStart = grid.rowPos[row] as number
  const rowNode = table.content.child(row)
  const rowEnd = rowStart + rowNode.nodeSize

  // Cells starting in this row and continuing below move down a row, one
  // shorter. Inserted from the last column to the first so earlier insertion
  // points in the next row stay where they were measured.
  const continuing = grid.cells
    .filter((entry) => entry.row === row && entry.rowspan > 1)
    .sort((a, b) => b.col - a.col)
  if (continuing.length) {
    const nextRow = row + 1
    const nextCells = grid.cells.filter((entry) => entry.row === nextRow)
    const nextRowNode = table.content.child(nextRow)
    const nextRowEnd = (grid.rowPos[nextRow] as number) + nextRowNode.nodeSize - 1
    for (const entry of continuing) {
      const before = nextCells.find((candidate) => candidate.col > entry.col)
      const at = before ? before.pos : nextRowEnd
      tr.insert(
        at,
        entry.node.type.create(
          { ...entry.node.attrs, rowspan: entry.rowspan - 1 },
          entry.node.content,
        ),
      )
    }
  }
  // Cells from above that reach into this row shrink by one.
  const shrink = new Set<Cell>()
  for (const entry of grid.slots[row] ?? []) if (entry && entry.row < row) shrink.add(entry)
  for (const entry of shrink) tr.setNodeAttrs(entry.pos, { rowspan: entry.rowspan - 1 })

  tr.delete(rowStart, rowEnd)
  tr.selectAt(Math.min(rowStart + 2, tr.doc.content.size))
  return true
}

// --- columns ------------------------------------------------------------

function addColumn(tr: Transaction, place: Place, after: boolean): boolean {
  const { grid, cell } = place
  const boundary = after ? cell.col + cell.colspan : cell.col
  const widen = new Set<Cell>()
  // The grid was measured against the document as it is now; anything this
  // function inserts moves what comes after it, and only those steps count.
  const measuredAt = tr.steps.length

  // Last row first, so the positions of rows above are untouched by what is
  // inserted below them.
  for (let row = grid.height - 1; row >= 0; row--) {
    const line = grid.slots[row] ?? []
    const left = boundary > 0 ? line[boundary - 1] : undefined
    const right = boundary < grid.width ? line[boundary] : undefined
    if (left && left === right) {
      widen.add(left)
      continue
    }
    // A cell of this row's own kind: header rows stay header rows.
    const ref = right ?? left
    const type = ref ? ref.node.type : place.table.type.schema.nodes.tableCell
    if (!type) return false
    const made = emptyCell(type)
    if (!made) return false
    // Before the first cell of this row that starts at or past the boundary,
    // else at the row's end.
    const own = grid.cells.filter((entry) => entry.row === row)
    const next = own.find((entry) => entry.col >= boundary)
    const rowNode = place.table.content.child(row)
    const at = next ? next.pos : (grid.rowPos[row] as number) + rowNode.nodeSize - 1
    tr.insert(at, made)
  }
  // A widened cell may sit below rows that gained a cell after it was
  // measured, so its position is brought forward through those insertions.
  const since = tr.mapping.slice(measuredAt)
  for (const wide of widen)
    tr.setNodeAttrs(since.map(wide.pos, -1), { colspan: wide.colspan + 1 })
  return true
}

function deleteColumn(tr: Transaction, place: Place): boolean {
  const { grid, cell, table, tableStart } = place
  if (grid.width <= 1) {
    tr.delete(tableStart - 1, tableStart + table.nodeSize - 1)
    return true
  }
  const col = cell.col
  const handled = new Set<Cell>()
  for (let row = grid.height - 1; row >= 0; row--) {
    const entry = grid.slots[row]?.[col]
    if (!entry || handled.has(entry)) continue
    handled.add(entry)
    if (entry.colspan > 1) tr.setNodeAttrs(entry.pos, { colspan: entry.colspan - 1 })
    else tr.delete(entry.pos, entry.pos + entry.node.nodeSize)
  }
  tr.selectAt(Math.min(cell.pos + 2, tr.doc.content.size))
  return true
}

// --- headers and movement -----------------------------------------------

function toggleHeaderRow(tr: Transaction, place: Place): boolean {
  const { grid, table } = place
  const first = grid.cells.filter((entry) => entry.row === 0)
  if (!first.length) return false
  const schema = table.type.schema
  const allHeaders = first.every(isHeader)
  const type = allHeaders ? schema.nodes.tableCell : schema.nodes.tableHeader
  if (!type) return false
  for (const entry of [...first].reverse()) {
    tr.replaceWith(
      entry.pos,
      entry.pos + entry.node.nodeSize,
      type.create(entry.node.attrs, entry.node.content),
    )
  }
  return true
}

function moveCell(tr: Transaction, place: Place, delta: 1 | -1): boolean {
  const { grid, cell } = place
  const index = grid.cells.indexOf(cell)
  const next = grid.cells[index + delta]
  if (next) {
    intoCell(tr, next.pos)
    return true
  }
  if (delta === -1) return false
  // Tab out of the last cell makes a row to land in, the way spreadsheets do.
  const lastRow = grid.cells.filter((entry) => entry.row === grid.height - 1)
  const anchor = lastRow[0] ?? cell
  if (!addRow(tr, { ...place, cell: anchor }, true)) return false
  const newRowPos = place.tableStart + place.table.content.size
  intoCell(tr, newRowPos + 1)
  return true
}

const inTable =
  (run: (tr: Transaction, place: Place) => boolean): Command =>
  (ctx) => {
    const { tr } = engine(ctx)
    const place = locate(tr)
    return place ? run(tr, place) : false
  }

export const table = {
  kind: 'node',
  name: 'table' as const,
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
      if (!ctx.insert(buildTable(rows, cols), at as never)) return false
      // Into the first cell, ready to type.
      tr.selectAt(at + 3)
      return true
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
    addRowAfter: /* @__PURE__ */ inTable((tr, place) => addRow(tr, place, true)),
    addRowBefore: /* @__PURE__ */ inTable((tr, place) => addRow(tr, place, false)),
    deleteRow: /* @__PURE__ */ inTable(deleteRow),
    addColumnAfter: /* @__PURE__ */ inTable((tr, place) => addColumn(tr, place, true)),
    addColumnBefore: /* @__PURE__ */ inTable((tr, place) => addColumn(tr, place, false)),
    deleteColumn: /* @__PURE__ */ inTable(deleteColumn),
    toggleHeaderRow: /* @__PURE__ */ inTable(toggleHeaderRow),
    goToNextCell: /* @__PURE__ */ inTable((tr, place) => moveCell(tr, place, 1)),
    goToPreviousCell: /* @__PURE__ */ inTable((tr, place) => moveCell(tr, place, -1)),
  },
  keys: {
    Tab: 'goToNextCell',
    'Shift-Tab': 'goToPreviousCell',
  },
} satisfies NodeDef<{
  insertTable: Command<[rows?: number, cols?: number]>
  deleteTable: Command
  addRowAfter: Command
  addRowBefore: Command
  deleteRow: Command
  addColumnAfter: Command
  addColumnBefore: Command
  deleteColumn: Command
  toggleHeaderRow: Command
  goToNextCell: Command
  goToPreviousCell: Command
}>

export const tableRow = {
  kind: 'node',
  name: 'tableRow' as const,
  content: '(tableCell | tableHeader)+',
  parseDOM: [{ tag: 'tr' }],
  toDOM: () => ['tr', 0],
} satisfies NodeDef

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

export const tableCell = {
  kind: 'node',
  name: 'tableCell' as const,
  content: 'block+',
  attrs: cellAttrs,
  parseDOM: [{ tag: 'td', getAttrs: (dom) => cellAttrsFrom(dom as Element) }],
  toDOM: (node) => cellDOM('td', node.attrs),
} satisfies NodeDef

export const tableHeader = {
  kind: 'node',
  name: 'tableHeader' as const,
  content: 'block+',
  attrs: cellAttrs,
  parseDOM: [{ tag: 'th', getAttrs: (dom) => cellAttrsFrom(dom as Element) }],
  toDOM: (node) => cellDOM('th', node.attrs),
} satisfies NodeDef

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
