import type { Node } from '../model/node'
import type { ResolvedPos } from '../model/resolved-pos'
import type { Mapping } from '../transform/step-map'

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

  abstract map(doc: Node, mapping: Mapping): Selection
  abstract eq(other: Selection): boolean

  /** The nearest valid text position at or after `pos`. */
  static nearestTextPos(doc: Node, pos: number, bias: -1 | 1 = 1): number {
    const limit = doc.content.size
    const clamped = Math.max(0, Math.min(limit, pos))
    if (canHoldText(doc, clamped)) return clamped
    for (let distance = 1; distance <= limit; distance++) {
      const forward = clamped + distance * bias
      if (forward >= 0 && forward <= limit && canHoldText(doc, forward)) return forward
      const back = clamped - distance * bias
      if (back >= 0 && back <= limit && canHoldText(doc, back)) return back
    }
    return 0
  }
}

function canHoldText(doc: Node, pos: number): boolean {
  try {
    return doc.resolve(pos).parent.isTextblock
  } catch {
    return false
  }
}

/** A range of text, which is what a caret or a highlight is. */
export class TextSelection extends Selection {
  map(doc: Node, mapping: Mapping): Selection {
    const anchor = Selection.nearestTextPos(doc, mapping.map(this.anchor))
    const head = Selection.nearestTextPos(doc, mapping.map(this.head))
    return TextSelection.create(doc, anchor, head)
  }

  eq(other: Selection): boolean {
    return (
      other instanceof TextSelection && other.anchor === this.anchor && other.head === this.head
    )
  }

  static create(doc: Node, anchor: number, head: number = anchor): TextSelection {
    const $anchor = doc.resolve(Selection.nearestTextPos(doc, anchor))
    const $head = doc.resolve(Selection.nearestTextPos(doc, head))
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

  map(doc: Node, mapping: Mapping): Selection {
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
