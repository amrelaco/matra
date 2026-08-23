import type { Mark } from './mark'
import type { Node } from './node'

/** One level of the ancestor chain a position sits inside. */
interface Frame {
  node: Node
  /** Index of the child at or after the position, within `node`. */
  index: number
  /** Absolute position of the first child inside `node`. */
  contentStart: number
}

/**
 * A position, resolved.
 *
 * A bare number says nothing about where it is. Resolving walks it down the
 * tree and records the chain of ancestors, so the editor can ask which node it
 * is in, how deep, and what sits either side.
 */
export class ResolvedPos {
  private constructor(
    readonly pos: number,
    private readonly frames: readonly Frame[],
    /** Characters into a text node, or 0 when the position is between nodes. */
    readonly textOffset: number,
  ) {}

  static resolve(doc: Node, pos: number): ResolvedPos {
    if (pos < 0 || pos > doc.content.size) {
      throw new RangeError(
        `Matra: position ${pos} outside document of size ${doc.content.size}`,
      )
    }
    const frames: Frame[] = []
    let node = doc
    let contentStart = 0
    let offset = pos

    for (;;) {
      const { index, offset: childOffset } = node.content.findIndex(offset)
      const remainder = offset - childOffset
      frames.push({ node, index, contentStart })
      if (remainder === 0) return new ResolvedPos(pos, frames, 0)

      const child = node.child(index)
      if (child.isText) return new ResolvedPos(pos, frames, remainder)

      node = child
      contentStart = contentStart + childOffset + 1
      offset = remainder - 1
    }
  }

  private frame(depth: number): Frame {
    const frame = this.frames[depth]
    if (!frame) throw new RangeError(`Matra: no depth ${depth} at position ${this.pos}`)
    return frame
  }

  get depth(): number {
    return this.frames.length - 1
  }

  /** The node directly containing this position. */
  get parent(): Node {
    return this.frame(this.depth).node
  }

  /** How far into `parent` the position sits. */
  get parentOffset(): number {
    return this.pos - this.start(this.depth)
  }

  node(depth: number = this.depth): Node {
    return this.frame(depth).node
  }

  index(depth: number = this.depth): number {
    return this.frame(depth).index
  }

  indexAfter(depth: number = this.depth): number {
    const frame = this.frame(depth)
    // Sitting exactly on a boundary means the index is already "after".
    return frame.index + (depth === this.depth && this.textOffset === 0 ? 0 : 1)
  }

  /** First position inside the node at `depth`. */
  start(depth: number = this.depth): number {
    return this.frame(depth).contentStart
  }

  /** Last position inside the node at `depth`. */
  end(depth: number = this.depth): number {
    return this.start(depth) + this.node(depth).content.size
  }

  /** Position immediately before the node at `depth`. */
  before(depth: number): number {
    if (depth === 0) throw new RangeError('Matra: nothing sits before the document')
    return this.start(depth) - 1
  }

  /** Position immediately after the node at `depth`. */
  after(depth: number): number {
    if (depth === 0) throw new RangeError('Matra: nothing sits after the document')
    return this.end(depth) + 1
  }

  get nodeAfter(): Node | null {
    const parent = this.parent
    const index = this.index()
    if (this.textOffset > 0) {
      const child = parent.child(index)
      return child.cutText(this.textOffset, child.text?.length ?? 0)
    }
    return index < parent.childCount ? parent.child(index) : null
  }

  get nodeBefore(): Node | null {
    const parent = this.parent
    const index = this.index()
    if (this.textOffset > 0) return parent.child(index).cutText(0, this.textOffset)
    return index > 0 ? parent.child(index - 1) : null
  }

  /** Marks that text typed here would carry. */
  marks(): readonly Mark[] {
    const parent = this.parent
    const index = this.index()
    if (parent.childCount === 0) return []

    // Inside a text node, inherit its marks outright.
    if (this.textOffset > 0) return parent.child(index).marks

    const before = index > 0 ? parent.child(index - 1) : null
    const after = index < parent.childCount ? parent.child(index) : null
    if (!before) return after?.marks ?? []
    if (!after) return before.marks
    // Between two nodes, keep only what both agree on.
    return before.marks.filter((mark) => mark.isInSet(after.marks))
  }

  /** Deepest depth this position and `other` have in common. */
  sharedDepth(other: ResolvedPos): number {
    let depth = 0
    while (
      depth < this.depth &&
      depth < other.depth &&
      this.node(depth) === other.node(depth) &&
      this.start(depth + 1) === other.start(depth + 1)
    ) {
      depth++
    }
    return depth
  }

  /**
   * The shallowest block range covering this position and `other`.
   *
   * `wrapIn` and `lift` both need this: it is the span that can be wrapped or
   * unwrapped as a unit.
   */
  blockRange(
    other: ResolvedPos = this,
    predicate?: (node: Node) => boolean,
  ): {
    $from: ResolvedPos
    $to: ResolvedPos
    depth: number
    start: number
    end: number
  } | null {
    if (other.pos < this.pos) return other.blockRange(this, predicate)
    for (let depth = this.depth - (this.parent.isTextblock ? 1 : 0); depth >= 0; depth--) {
      if (other.pos <= this.end(depth) && (!predicate || predicate(this.node(depth)))) {
        return {
          $from: this,
          $to: other,
          depth,
          start: this.start(depth),
          end: this.end(depth),
        }
      }
    }
    return null
  }

  toString(): string {
    const path = this.frames
      .slice(1)
      .map((frame, i) => `${frame.node.type.name}_${this.index(i)}`)
      .join('/')
    return `${path}:${this.parentOffset}`
  }
}
