import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'

/**
 * A bare number, or a length in px, em, rem or percent · nothing else.
 *
 * The value lands in a `style` attribute, and a style attribute is a place
 * where `1; background: url(x)` is a second declaration. Matching the whole
 * string against the few shapes a line height can take is what keeps it one.
 */
const LINE_HEIGHT = /^(\d+(\.\d+)?)(px|em|rem|%)?$/

/** The value as it will be written, or null when it is not a line height. */
export function lineHeightOf(value: unknown): string | null {
  const text =
    typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''
  return LINE_HEIGHT.test(text) ? text : null
}

/**
 * Line height as an attribute on existing blocks.
 *
 * Built the way alignment is: the attribute is declared here and lands on
 * every type named, so a paragraph that knows nothing about line height still
 * keeps, renders and parses it. The document stores the value it was given
 * (`1.5`, `24px`) and the element gets `style="line-height: …"` — after the
 * value has been checked, on the way in and on the way out alike.
 *
 * ```ts
 * editor.commands.setLineHeight(1.5)
 * editor.commands.setLineHeight('28px')
 * editor.commands.unsetLineHeight()
 * ```
 */
export function lineHeight(types: readonly string[] = ['paragraph', 'heading']): ExtensionDef<{
  setLineHeight: Command<[value: string | number]>
  unsetLineHeight: Command
}> {
  const apply = (ctx: Parameters<Command>[0], value: string | null): boolean => {
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
      // Already so · saying it again is not a change, and `can` should say no.
      if ((target.attrs.lineHeight ?? null) === value) continue
      const wasSelection = { from: tr.selection.from, to: tr.selection.to }
      tr.selectAt(target.pos + 1)
      changed = ctx.setBlockType(target.name, { ...target.attrs, lineHeight: value }) || changed
      tr.selectAt(wasSelection.from, wasSelection.to)
    }
    return changed
  }

  return {
    kind: 'extension',
    name: 'lineHeight',
    attributes: [
      {
        types,
        attrs: {
          lineHeight: {
            default: null,
            render: (value) => {
              const safe = lineHeightOf(value)
              return safe ? { style: `line-height: ${safe}` } : null
            },
            parse: (dom) => lineHeightOf((dom as HTMLElement).style?.lineHeight),
          },
        },
      },
    ],
    commands: {
      setLineHeight: (ctx, value) => {
        const safe = lineHeightOf(value)
        return safe ? apply(ctx, safe) : false
      },
      unsetLineHeight: (ctx) => apply(ctx, null),
    },
  }
}
