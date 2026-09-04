import type { Node } from '../model/node'
import type { ResolvedPos } from '../model/resolved-pos'
import type { MapResult } from '../transform/step-map'

/** Anything a position can be moved through: one step's map, or a run of them. */
export interface Mappable {
  map(pos: number, assoc?: -1 | 1): number
  mapResult(pos: number, assoc?: -1 | 1): MapResult
}

/**
 * Where the user is.
 *
 * Selections are immutable and always valid against the document they were
 * made from — creating one snaps to a position text can actually occupy, so
 * later code never has to wonder.
 */
export abstract class Selection {
  constructor(
    readonly $anchor: ResolvedPos,
    readonly $head: ResolvedPos,
  ) {}

  get anchor(): number {
    return this.$anchor.pos
  }

  get head(): number {
    return this.$head.pos
  }

  get from(): number {
    return Math.min(this.anchor, this.head)
  }

  get to(): number {
    return Math.max(this.anchor, this.head)
  }

  get empty(): boolean {
    return this.anchor === this.head
  }

  /** Resolved position of the earlier end, whichever way round the drag went. */
  get $from(): ResolvedPos {
    return this.anchor <= this.head ? this.$anchor : this.$head
  }

  /** Resolved position of the later end. */
  get $to(): ResolvedPos {
    return this.anchor <= this.head ? this.$head : this.$anchor
  }

  abstract map(doc: Node, mapping: Mappable): Selection
  abstract eq(other: Selection): boolean

  /** The nearest valid text position at or after `pos`. */
  static nearestTextPos(doc: Node, pos: number, bias: -1 | 1 = 1): number {
    return nearestText(doc, pos, bias).pos
  }
}

/**
 * The nearest position text can occupy, already resolved.
 *
 * Nearly every caret lands where it was asked to, and resolving is the whole
 * cost of placing one — so the resolution made to check the position is the
 * one handed back, rather than thrown away and made again.
 */
function nearestText(doc: Node, pos: number, bias: -1 | 1): ResolvedPos {
  const limit = doc.content.size
  const clamped = Math.max(0, Math.min(limit, pos))
  const direct = textPos(doc, clamped)
  if (direct) return direct
  for (let distance = 1; distance <= limit; distance++) {
    const forward = clamped + distance * bias
    if (forward >= 0 && forward <= limit) {
      const hit = textPos(doc, forward)
      if (hit) return hit
    }
    const back = clamped - distance * bias
    if (back >= 0 && back <= limit) {
      const hit = textPos(doc, back)
      if (hit) return hit
    }
  }
  return doc.resolve(0)
}

function textPos(doc: Node, pos: number): ResolvedPos | null {
  try {
    const $pos = doc.resolve(pos)
    return $pos.parent.isTextblock ? $pos : null
  } catch {
    return null
  }
}

/** A range of text, which is what a caret or a highlight is. */
export class TextSelection extends Selection {
  map(doc: Node, mapping: Mappable): Selection {
    return TextSelection.create(doc, mapping.map(this.anchor), mapping.map(this.head))
  }

  eq(other: Selection): boolean {
    return (
      other instanceof TextSelection && other.anchor === this.anchor && other.head === this.head
    )
  }

  static create(doc: Node, anchor: number, head: number = anchor): TextSelection {
    const $anchor = nearestText(doc, anchor, 1)
    const $head = head === anchor ? $anchor : nearestText(doc, head, 1)
    return new TextSelection($anchor, $head)
  }

  /** A caret at the first place text can go. */
  static atStart(doc: Node): TextSelection {
    return TextSelection.create(doc, Selection.nearestTextPos(doc, 0, 1))
  }

  static atEnd(doc: Node): TextSelection {
    return TextSelection.create(doc, Selection.nearestTextPos(doc, doc.content.size, -1))
  }
}

/** A whole node selected — an image or a horizontal rule, say. */
export class NodeSelection extends Selection {
  readonly node: Node

  private constructor($anchor: ResolvedPos, $head: ResolvedPos, node: Node) {
    super($anchor, $head)
    this.node = node
  }

  map(doc: Node, mapping: Mappable): Selection {
    const pos = mapping.mapResult(this.anchor, 1)
    // If the node went away, fall back to a caret rather than pointing at nothing.
    if (pos.deleted) return TextSelection.create(doc, Selection.nearestTextPos(doc, pos.pos))
    try {
      return NodeSelection.create(doc, pos.pos)
    } catch {
      return TextSelection.create(doc, Selection.nearestTextPos(doc, pos.pos))
    }
  }

  eq(other: Selection): boolean {
    return other instanceof NodeSelection && other.anchor === this.anchor
  }

  static create(doc: Node, pos: number): NodeSelection {
    const $pos = doc.resolve(pos)
    const node = $pos.nodeAfter
    if (!node) throw new RangeError(`Matra: no node to select at ${pos}`)
    return new NodeSelection($pos, doc.resolve(pos + node.nodeSize), node)
  }
}
