import type { Node } from './node'

/**
 * An ordered run of nodes.
 *
 * Fragments are immutable and cache their size, because position arithmetic
 * asks for it constantly.
 */
export class Fragment {
  readonly size: number

  /**
   * `size` is passed only where the caller already knows it.
   *
   * Summing the children is a walk of the whole run, and a fragment is built
   * once per edit at every level between the change and the root — so on a long
   * document the sum, not the change, is what typing costs.
   */
  private constructor(
    readonly content: readonly Node[],
    size?: number,
  ) {
    if (size !== undefined) {
      this.size = size
      return
    }
    let total = 0
    for (const child of content) total += child.nodeSize
    this.size = total
  }

  static empty = new Fragment([])

  static from(content?: Node | readonly Node[] | Fragment | null): Fragment {
    if (!content) return Fragment.empty
    if (content instanceof Fragment) return content
    if (Array.isArray(content)) {
      return content.length ? new Fragment(joinText(content)) : Fragment.empty
    }
    return new Fragment([content as Node])
  }

  get childCount(): number {
    return this.content.length
  }

  get firstChild(): Node | null {
    return this.content[0] ?? null
  }

  get lastChild(): Node | null {
    return this.content[this.content.length - 1] ?? null
  }

  child(index: number): Node {
    const node = this.content[index]
    if (!node) throw new RangeError(`Matra: no child at index ${index}`)
    return node
  }

  /** Iterate children with their offset — the form position maths needs. */
  *entries(): Generator<[node: Node, offset: number, index: number]> {
    let offset = 0
    for (let index = 0; index < this.content.length; index++) {
      const node = this.content[index] as Node
      yield [node, offset, index]
      offset += node.nodeSize
    }
  }

  [Symbol.iterator](): Iterator<Node> {
    return this.content[Symbol.iterator]()
  }

  forEach(fn: (node: Node, offset: number, index: number) => void): void {
    for (const [node, offset, index] of this.entries()) fn(node, offset, index)
  }

  append(other: Fragment): Fragment {
    if (!other.size) return this
    if (!this.size) return other
    return new Fragment(joinText([...this.content, ...other.content]))
  }

  /**
   * The same run with one child swapped.
   *
   * This is the shape every nested edit takes: a paragraph changes, and each
   * ancestor up to the document is rebuilt around the one child that moved.
   * Doing it by cut-append-append walks the run three times and re-derives a
   * size that differs from the old one by exactly one child, which is why a
   * keystroke used to cost the length of the document. Here it is one array
   * copy and one subtraction.
   *
   * Text is the exception: a text node can merge with its neighbours, so the
   * canonical form has to be rebuilt rather than assumed. Nothing else can, so
   * everything else takes the short way.
   */
  replaceChild(index: number, node: Node): Fragment {
    const old = this.content[index]
    if (!old) throw new RangeError(`Matra: no child at index ${index}`)
    if (old === node) return this

    const next = this.content.slice()
    next[index] = node
    if (old.isText || node.isText) return Fragment.from(next)
    return new Fragment(next, this.size - old.nodeSize + node.nodeSize)
  }

  /** The index and offset of the child containing `pos`. */
  findIndex(pos: number): { index: number; offset: number } {
    if (pos === 0) return { index: 0, offset: 0 }
    if (pos === this.size) return { index: this.content.length, offset: this.size }
    if (pos > this.size || pos < 0) {
      throw new RangeError(`Matra: position ${pos} outside fragment of size ${this.size}`)
    }
    let offset = 0
    for (let index = 0; index < this.content.length; index++) {
      const child = this.content[index] as Node
      const end = offset + child.nodeSize
      // A position landing exactly on a boundary belongs to the child that
      // starts there, not the one that ends there.
      if (end > pos) return { index, offset }
      offset = end
    }
    return { index: this.content.length, offset: this.size }
  }

  /** The slice between two positions, splitting text nodes as needed. */
  cut(from: number, to: number = this.size): Fragment {
    if (from === 0 && to === this.size) return this
    const out: Node[] = []
    if (to <= from) return Fragment.empty
    let offset = 0
    for (const child of this.content) {
      const end = offset + child.nodeSize
      if (end > from && offset < to) {
        if (child.isText) {
          const start = Math.max(0, from - offset)
          const stop = Math.min(child.text?.length ?? 0, to - offset)
          out.push(child.cutText(start, stop))
        } else if (offset >= from && end <= to) {
          out.push(child)
        } else {
          // Partially covered non-text node: descend into its content.
          const inner = child.content.cut(
            Math.max(0, from - offset - 1),
            Math.min(child.content.size, to - offset - 1),
          )
          out.push(child.copy(inner))
        }
      }
      offset = end
    }
    return out.length ? new Fragment(joinText(out)) : Fragment.empty
  }

  eq(other: Fragment): boolean {
    if (this === other) return true
    if (this.content.length !== other.content.length) return false
    return this.content.every((node, i) => node.eq(other.content[i] as Node))
  }

  toJSON(): unknown[] | undefined {
    return this.content.length ? this.content.map((node) => node.toJSON()) : undefined
  }

  toString(): string {
    return this.content.map(String).join(', ')
  }
}

/** Merge adjacent text nodes carrying identical marks — the canonical form. */
function joinText(nodes: readonly Node[]): Node[] {
  const out: Node[] = []
  for (const node of nodes) {
    const previous = out[out.length - 1]
    if (
      previous?.isText &&
      node.isText &&
      previous.sameMarkup(node) &&
      previous.text !== undefined &&
      node.text !== undefined
    ) {
      out[out.length - 1] = previous.withText(previous.text + node.text)
      continue
    }
    if (node.isText && node.text === '') continue
    out.push(node)
  }
  return out
}
