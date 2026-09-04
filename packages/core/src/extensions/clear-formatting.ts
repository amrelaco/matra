import { engine } from '../internal'
import type { Command, Ctx, ExtensionDef } from '../types'

/** Every mark off the selection. */
const unsetAllMarks: Command = (ctx) => {
  const { schema } = engine(ctx)
  let changed = false
  for (const name in schema.marks) changed = ctx.removeMark(name) || changed
  return changed
}

/**
 * Every block in the selection back to a paragraph.
 *
 * Wrappers first — a quote, a list — then the textblocks that are left. Each
 * lift may change what the selection covers, so the selection is read again
 * after each one rather than remembered.
 */
const clearBlocks: Command = (ctx) => {
  const { tr, schema } = engine(ctx)
  const paragraph = schema.nodes.paragraph
  if (!paragraph) return false
  let changed = false
  for (let guard = 0; guard < 16 && ctx.lift(); guard++) changed = true
  let retype = false
  tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node) => {
    if (node.isTextblock && node.type !== paragraph) retype = true
    return !node.isTextblock
  })
  if (retype) changed = ctx.setBlockType('paragraph') || changed
  return changed
}

/**
 * Back to plain text: every mark off the selection, every block a paragraph.
 *
 * The toolbar button labelled with a crossed-out T. One command rather than a
 * call per mark, so the host does not have to know which marks the editor was
 * built with — and one undo step, because that is what the person pressing it
 * expects to get back.
 */
export const clearFormatting: ExtensionDef<{
  clearFormatting: Command
  unsetAllMarks: Command
  clearBlocks: Command
}> = {
  kind: 'extension',
  name: 'clearFormatting',
  commands: {
    unsetAllMarks,
    clearBlocks,
    clearFormatting: (ctx: Ctx) => {
      const marks = unsetAllMarks(ctx)
      const blocks = clearBlocks(ctx)
      return marks || blocks
    },
  },
  keys: { 'Mod-\\': 'clearFormatting' },
}
