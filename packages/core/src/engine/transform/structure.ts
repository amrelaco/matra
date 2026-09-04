import { Fragment } from '../model/fragment'
import type { Node } from '../model/node'
import type { NodeRange } from '../model/resolved-pos'
import type { NodeType } from '../model/schema'

export interface Wrapper {
  type: NodeType
  attrs?: Record<string, unknown> | null
}

/**
 * How to wrap a run of nodes in a type, if it is possible at all.
 *
 * Wrapping a paragraph in a blockquote is one level. Wrapping it in a list is
 * two — the list holds items, the item holds the paragraph — so this looks for
 * a single intermediate type when the direct wrap does not fit.
 */
export function findWrapping(
  range: NodeRange,
  type: NodeType,
  attrs?: Record<string, unknown> | null,
): Wrapper[] | null {
  const covered: Node[] = []
  for (let i = range.startIndex; i < range.endIndex; i++) {
    covered.push(range.parent.child(i))
  }
  const content = Fragment.from(covered)

  // Would the parent even accept this type where the children are now?
  const { parent, start, end } = range
  if (!accepts(parent, range.$from.start(range.depth), start, end, [type.create(attrs)])) {
    return null
  }

  if (type.validContent(content)) return [{ type, attrs }]

  // Try one intermediate, which is what lists need.
  for (const candidate of type.contentMatch.allowed) {
    const inner = candidate as NodeType
    if (!inner.fillable || !inner.validContent(content)) continue
    if (!type.validContent(Fragment.from([inner.create(null, content)]))) continue
    return [{ type, attrs }, { type: inner }]
  }
  return null
}

/**
 * The depth a range can be lifted to, or null when it cannot move.
 *
 * Lifting means removing the wrapper the range sits in, so the question is
 * whether the grandparent would still hold valid content afterwards.
 */
export function liftTarget(range: NodeRange): number | null {
  if (range.depth === 0) return null

  const $from = range.$from
  const parent = range.parent
  const grandparent = $from.node(range.depth - 1)

  const covered: Node[] = []
  for (let i = range.startIndex; i < range.endIndex; i++) covered.push(parent.child(i))

  // The wrapper's other children stay put only if the whole wrapper is covered.
  if (range.startIndex !== 0 || range.endIndex !== parent.childCount) return null

  const parentStart = $from.start(range.depth) - 1
  const grandStart = $from.start(range.depth - 1)
  const fits = accepts(
    grandparent,
    grandStart,
    parentStart,
    parentStart + parent.nodeSize,
    covered,
  )
  return fits ? range.depth - 1 : null
}

/**
 * Would `parent` still hold valid content with `nodes` where `from`..`to` is?
 *
 * The question every structural change asks before it moves anything, with
 * `parentStart` the position of the parent's first child.
 */
export function accepts(
  parent: Node,
  parentStart: number,
  from: number,
  to: number,
  nodes: readonly Node[] | Fragment,
): boolean {
  const content = parent.content
    .cut(0, from - parentStart)
    .append(Fragment.from(nodes))
    .append(parent.content.cut(to - parentStart))
  return parent.type.validContent(content)
}

/** Whether a block can be split at `pos`. */
export function canSplit(doc: Node, pos: number): boolean {
  const $pos = doc.resolve(pos)
  const parent = $pos.parent
  if (!parent.isTextblock) return false
  const head = parent.content.cut(0, $pos.parentOffset)
  const tail = parent.content.cut($pos.parentOffset)
  return parent.type.validContent(head) && parent.type.validContent(tail)
}
