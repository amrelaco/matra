import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'
import { colorOf } from './color'

type Patch = { blockColor?: string | null; blockBackground?: string | null }

/**
 * Colour on the block itself, the way Notion means it.
 *
 * `textStyle` already colours *text*: a mark on a run of characters, which is
 * the right model for colouring three words in a sentence. It is the wrong
 * model for colouring a paragraph — mark every character and the background
 * still stops at the last one, so what you get is a band around the words
 * rather than a band across the block, and it breaks apart the moment someone
 * types at the end.
 *
 * This is an attribute on the block instead. It survives being dragged
 * somewhere else, it covers the full measure, and an empty paragraph can hold
 * a colour and still show it — none of which a mark can do.
 *
 * Built the way alignment and line height are, so a paragraph that knows
 * nothing about colour still keeps, renders and parses it:
 *
 * ```ts
 * editor.commands.setBlockBackground('#fdecc8')
 * editor.commands.setBlockColor('rgb(212, 76, 71)')
 * editor.commands.unsetBlockColors()
 * ```
 *
 * The palette is deliberately not here. Notion ships ten named colours and
 * stores the name, which is how a document follows a theme; this stores the
 * value it was given and leaves naming to the application, because a headless
 * editor that decides your ten colours has decided your design.
 */
export function blockColor(types: readonly string[] = ['paragraph', 'heading']): ExtensionDef<{
  setBlockColor: Command<[color: string]>
  unsetBlockColor: Command
  setBlockBackground: Command<[color: string]>
  unsetBlockBackground: Command
  unsetBlockColors: Command
}> {
  const apply = (ctx: Parameters<Command>[0], patch: Patch): boolean => {
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

    const keys = Object.keys(patch) as Array<keyof Patch>
    for (const target of targets) {
      // Already so · saying it again is not a change, and `can` should say no.
      if (keys.every((key) => (target.attrs[key] ?? null) === (patch[key] ?? null))) continue
      const wasSelection = { from: tr.selection.from, to: tr.selection.to }
      tr.selectAt(target.pos + 1)
      changed = ctx.setBlockType(target.name, { ...target.attrs, ...patch }) || changed
      tr.selectAt(wasSelection.from, wasSelection.to)
    }
    return changed
  }

  return {
    kind: 'extension',
    name: 'blockColor',
    attributes: [
      {
        types,
        attrs: {
          blockColor: {
            default: null,
            render: (value) => {
              const safe = colorOf(value)
              return safe ? { style: `color: ${safe}` } : null
            },
            parse: (dom) => colorOf((dom as HTMLElement).style?.color),
          },
          blockBackground: {
            default: null,
            render: (value) => {
              const safe = colorOf(value)
              // The data attribute is the hook a background needs and a text
              // colour does not: a filled block wants padding and a corner,
              // and that is a decision for the page's stylesheet rather than
              // an inline style nobody can override.
              return safe
                ? { style: `background-color: ${safe}`, 'data-block-background': safe }
                : null
            },
            parse: (dom) => colorOf((dom as HTMLElement).style?.backgroundColor),
          },
        },
      },
    ],
    commands: {
      setBlockColor: (ctx, color) => {
        const safe = colorOf(color)
        // A value that failed the check is refused, not quietly ignored.
        return safe ? apply(ctx, { blockColor: safe }) : false
      },
      unsetBlockColor: (ctx) => apply(ctx, { blockColor: null }),
      setBlockBackground: (ctx, color) => {
        const safe = colorOf(color)
        return safe ? apply(ctx, { blockBackground: safe }) : false
      },
      unsetBlockBackground: (ctx) => apply(ctx, { blockBackground: null }),
      unsetBlockColors: (ctx) => apply(ctx, { blockColor: null, blockBackground: null }),
    },
  }
}

/**
 * A corner and a little air for a filled block.
 *
 * Deliberately no horizontal padding. A block element's background already
 * spans the full measure, so side padding buys nothing but a text shift, and
 * the negative margin that would pull the words back cannot be relied on to
 * win: one `.editor p { margin: … }` in the host's stylesheet outranks a
 * single attribute selector, and the block quietly steps sideways instead.
 * Vertical padding has no such argument to lose.
 *
 * A host that wants Notion's inset can add it, with its own specificity to
 * spend.
 */
export const blockColorCSS = `
[data-block-background] {
  padding-block: 2px;
  border-radius: 3px;
}
`
