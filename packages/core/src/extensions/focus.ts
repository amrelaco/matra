import { engine } from '../internal'
import type { DecorationSpec, ExtensionDef, Pos } from '../types'

export interface FocusOptions {
  /** The class put on the block the caret is in. Default `has-focus`. */
  className?: string
  /** Also mark every ancestor block — the list around the item. Default false. */
  ancestors?: boolean
}

/**
 * A class on the block the caret is in.
 *
 * What a focus mode dims everything else against, and what a block toolbar
 * anchors to. A decoration rather than an attribute, so the document never
 * knows which block was being looked at.
 */
export function focus(options: FocusOptions = {}): ExtensionDef {
  const className = options.className ?? 'has-focus'
  return {
    kind: 'extension',
    name: 'focus',
    decorations(ctx) {
      const $from = engine(ctx).state.selection.$from
      if ($from.depth === 0) return []
      const out: DecorationSpec[] = []
      const shallowest = options.ancestors ? 1 : $from.depth
      for (let depth = $from.depth; depth >= shallowest; depth--) {
        out.push({
          type: 'node',
          from: $from.before(depth) as Pos,
          to: $from.after(depth) as Pos,
          attrs: { class: className },
        })
      }
      return out
    },
  }
}
