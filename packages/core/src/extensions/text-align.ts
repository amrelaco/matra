import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

const ALIGNMENTS: TextAlign[] = ['left', 'center', 'right', 'justify']

/**
 * Alignment as an attribute on existing blocks.
 *
 * It is an extension rather than a node because alignment applies to whatever
 * textblock is already there — turning a heading into a "centered heading"
 * node type would double the schema for no gain.
 */
export function textAlign(types: readonly string[] = ['paragraph', 'heading']): ExtensionDef<{
  setTextAlign: Command<[TextAlign]>
  unsetTextAlign: Command
}> {
  const apply = (ctx: Parameters<Command>[0], align: TextAlign | null): boolean => {
    const { tr } = engine(ctx)
    const { from, to } = tr.selection
    let changed = false

    const targets: Array<{ pos: number; name: string; attrs: Record<string, unknown> }> = []
    tr.doc.descendants((node, pos) => {
      if (pos + node.nodeSize <= from || pos >= to) return undefined
      if (!node.isTextblock || !types.includes(node.type.name)) return undefined
      targets.push({ pos, name: node.type.name, attrs: node.attrs })
      return undefined
    })

    for (const target of targets) {
      const wasSelection = { from: tr.selection.from, to: tr.selection.to }
      tr.selectAt(target.pos + 1)
      changed = ctx.setBlockType(target.name, { ...target.attrs, textAlign: align }) || changed
      tr.selectAt(wasSelection.from, wasSelection.to)
    }
    return changed
  }

  return {
    kind: 'extension',
    name: 'textAlign',
    commands: {
      setTextAlign: (ctx, align) => (ALIGNMENTS.includes(align) ? apply(ctx, align) : false),
      unsetTextAlign: (ctx) => apply(ctx, null),
    },
    keys: {
      'Mod-Shift-l': (ctx) => apply(ctx, 'left'),
      'Mod-Shift-e': (ctx) => apply(ctx, 'center'),
      'Mod-Shift-r': (ctx) => apply(ctx, 'right'),
    },
  }
}
