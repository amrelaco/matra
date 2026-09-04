import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'

export interface IndentOptions {
  /** Which blocks can be indented. Default paragraphs and headings. */
  types?: readonly string[]
  /** How many levels. Default 8. */
  max?: number
  /** Width of one level, in `em`. Default 2. */
  step?: number
}

/**
 * Block indentation, the way a word processor does it.
 *
 * An attribute on the block rather than a wrapper node: Tab on a paragraph
 * moves the paragraph in, Shift-Tab moves it back out, and the document says
 * `indent: 2` rather than nesting the paragraph inside something invented to
 * hold it. Inside a list the keys belong to the list, so this stands down
 * there.
 */
export function indent(options: IndentOptions = {}): ExtensionDef<{
  indent: Command
  outdent: Command
  setIndent: Command<[level: number]>
}> {
  const types = options.types ?? ['paragraph', 'heading']
  const max = Math.max(1, options.max ?? 8)
  const step = options.step ?? 2

  const level = (value: unknown): number => {
    const n = Number(value)
    return Number.isInteger(n) && n > 0 ? Math.min(max, n) : 0
  }

  const change = (ctx: Parameters<Command>[0], to: (current: number) => number): boolean => {
    const { tr } = engine(ctx)
    const $from = tr.selection.$from
    // A list owns Tab; indenting the paragraph inside an item would move the
    // text away from its bullet.
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.spec.listItem) return false
    }
    const targets: Array<{ pos: number; name: string; attrs: Record<string, unknown> }> = []
    tr.doc.nodesBetween(tr.selection.from, tr.selection.to, (node, pos) => {
      if (!node.isTextblock) return undefined
      if (types.includes(node.type.name)) {
        targets.push({ pos, name: node.type.name, attrs: node.attrs })
      }
      return false
    })
    let changed = false
    for (const target of targets) {
      const current = level(target.attrs.indent)
      const next = Math.max(0, Math.min(max, to(current)))
      if (next === current) continue
      const was = { from: tr.selection.from, to: tr.selection.to }
      tr.selectAt(target.pos + 1)
      changed = ctx.setBlockType(target.name, { ...target.attrs, indent: next }) || changed
      tr.selectAt(was.from, was.to)
    }
    return changed
  }

  return {
    kind: 'extension',
    name: 'indent',
    // After the lists, so Tab reaches a list item's own binding first.
    priority: -10,
    attributes: [
      {
        types,
        attrs: {
          indent: {
            default: 0,
            render: (value) => {
              const n = level(value)
              return n
                ? { 'data-indent': n, style: `margin-inline-start: ${n * step}em` }
                : null
            },
            parse: (dom) => level(dom.getAttribute('data-indent')),
          },
        },
      },
    ],
    commands: {
      indent: (ctx) => change(ctx, (n) => n + 1),
      outdent: (ctx) => change(ctx, (n) => n - 1),
      setIndent: (ctx, to) => change(ctx, () => level(to)),
    },
    keys: {
      Tab: 'indent',
      'Shift-Tab': 'outdent',
    },
  }
}
