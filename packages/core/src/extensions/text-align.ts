import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'

const ALIGNMENTS: TextAlign[] = ['left', 'center', 'right', 'justify']

const isAlignment = (value: unknown): value is TextAlign =>
  ALIGNMENTS.includes(value as TextAlign)

/**
 * Alignment as an attribute on existing blocks.
 *
 * It is an extension rather than a node because alignment applies to whatever
 * textblock is already there — turning a heading into a "centered heading"
 * node type would double the schema for no gain. The attribute is declared
 * here and lands on every type named, so a paragraph that knows nothing about
 * alignment still keeps, renders and parses it.
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
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return undefined
      if (types.includes(node.type.name)) {
        targets.push({ pos, name: node.type.name, attrs: node.attrs })
      }
      return false
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
    attributes: [
      {
        types,
        attrs: {
          textAlign: {
            default: null,
            render: (value) => (isAlignment(value) ? { style: `text-align: ${value}` } : null),
            parse: (dom) => {
              const styled = (dom as HTMLElement).style?.textAlign || dom.getAttribute('align')
              return isAlignment(styled) ? styled : null
            },
          },
        },
      },
    ],
    commands: {
      setTextAlign: (ctx, align) => (isAlignment(align) ? apply(ctx, align) : false),
      unsetTextAlign: (ctx) => apply(ctx, null),
    },
    keys: {
      'Mod-Shift-l': (ctx) => apply(ctx, 'left'),
      'Mod-Shift-e': (ctx) => apply(ctx, 'center'),
      'Mod-Shift-r': (ctx) => apply(ctx, 'right'),
    },
  }
}
