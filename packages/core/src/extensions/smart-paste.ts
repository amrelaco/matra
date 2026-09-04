import type { Schema } from '../engine/model'
import { engine } from '../internal'
import type { DocNode, ExtensionDef } from '../types'
import { fromMarkdown } from './markdown'

export interface SmartPasteOptions {
  /** Tab-separated and comma-separated text becomes a table. Default true. */
  tables?: boolean
  /** Comma-separated text counts as a table too. Default true. */
  csv?: boolean
  /** The first row of a pasted table is a header row. Default true. */
  headerRow?: boolean
  /** Text that reads as Markdown is parsed as Markdown. Default true. */
  markdown?: boolean
}

/** HTML that already says what it is. The parser handles it better than a guess would. */
const RICH = /<(table|ul|ol|h[1-6]|img|a |pre|blockquote|li)\b/i

const MARKDOWN_BLOCK =
  /^(?:#{1,6}\s|\s*[-*+]\s|\s*\d+[.)]\s|\s*>\s?|```|~~~|\s*(?:---|\*\*\*)\s*$|\s*[-*]\s\[[ xX]\]\s)/m
const MARKDOWN_INLINE =
  /\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|~~[^~\n]+~~/

/** Does this text read as Markdown? A block marker or a piece of inline syntax says yes. */
export function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_BLOCK.test(text) || MARKDOWN_INLINE.test(text)
}

/** One CSV line, quotes and all. */
function csvCells(line: string): string[] {
  const cells: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i] as string
    if (quoted) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += char
      }
    } else if (char === '"' && cell === '') {
      quoted = true
    } else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell)
  return cells.map((value) => value.trim())
}

/**
 * Rows and cells out of delimited text, or null when it is not a grid.
 *
 * Tabs are conclusive: nobody types a tab into prose. Commas are not, so a
 * comma-separated grid has to be regular — the same number of cells on every
 * line — and made of short cells, because two sentences with a comma each are
 * also "two lines with the same number of commas".
 */
export function parseDelimited(text: string, csv = true): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n')
  if (lines.length < 2) return null

  if (lines.every((line) => line.includes('\t'))) {
    const rows = lines.map((line) => line.split('\t').map((cell) => cell.trim()))
    const width = (rows[0] as string[]).length
    if (width >= 2 && rows.every((row) => row.length === width)) return rows
    return null
  }

  if (!csv || !lines.every((line) => line.includes(','))) return null
  const rows = lines.map(csvCells)
  const width = (rows[0] as string[]).length
  if (width < 2 || !rows.every((row) => row.length === width)) return null
  if (rows.some((row) => row.some((cell) => cell.length > 60))) return null
  return rows
}

/** Every node and mark type in a JSON tree exists in this schema. */
function fits(schema: Schema, node: DocNode): boolean {
  if (node.type !== 'text' && !schema.nodes[node.type]) return false
  if (node.marks?.some((mark) => !schema.marks[mark.type])) return false
  return (node.content ?? []).every((child) => fits(schema, child))
}

function tableFrom(grid: string[][], headerRow: boolean, schema: Schema): DocNode {
  const headers = headerRow && Boolean(schema.nodes.tableHeader)
  return {
    type: 'table',
    content: grid.map((cells, row) => ({
      type: 'tableRow',
      content: cells.map((cell) => ({
        type: row === 0 && headers ? 'tableHeader' : 'tableCell',
        content: [
          {
            type: 'paragraph',
            ...(cell ? { content: [{ type: 'text', text: cell }] } : {}),
          },
        ],
      })),
    })),
  }
}

/**
 * Paste what was meant, not what was copied.
 *
 * A spreadsheet copied as text is tabs and newlines; a README copied from a
 * terminal is Markdown; both arrive as a paragraph with the punctuation in
 * it. This looks at plain text before the editor does and, when the shape is
 * unmistakable, builds the table or parses the Markdown instead. Anything
 * with real HTML on the clipboard is left to the parser, which already reads
 * a table copied from a browser.
 *
 * Needs the table nodes for the table half and whatever nodes the Markdown
 * names for the other: a heading pasted into an editor with no heading
 * extension stays text, because that editor cannot hold one.
 */
export function smartPaste(options: SmartPasteOptions = {}): ExtensionDef {
  return {
    kind: 'extension',
    name: 'smartPaste',
    handlePaste: (ctx, data) => {
      const text = data.text
      if (!text || !text.trim()) return false
      if (data.html && RICH.test(data.html)) return false
      const { schema } = engine(ctx)

      if (options.tables !== false && schema.nodes.table && schema.nodes.tableRow) {
        const grid = parseDelimited(text, options.csv !== false)
        if (grid) {
          const table = tableFrom(grid, options.headerRow !== false, schema)
          if (fits(schema, table)) return ctx.insert(table)
        }
      }

      if (options.markdown !== false && looksLikeMarkdown(text)) {
        const blocks = fromMarkdown(text).content ?? []
        if (!blocks.length || !blocks.every((block) => fits(schema, block))) return false
        const only = blocks.length === 1 ? (blocks[0] as DocNode) : null
        // One paragraph of Markdown is inline formatting, and belongs where
        // the caret is rather than in a paragraph of its own.
        if (only && only.type === 'paragraph') {
          return only.content ? ctx.insert(only.content) : false
        }
        return ctx.insert(blocks)
      }
      return false
    },
  }
}
