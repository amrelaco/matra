import type { Node } from './node'

/**
 * Runs shorter than this are searched by walking them.
 *
 * A prefix index costs an allocation and pays back in log time, which only
 * beats a straight walk once the run is long enough to notice. The children of
 * a paragraph are few; the children of a document are not.
 */
const INDEX_FROM = 24

/**
 * An ordered run of nodes.
 *
 * Fragments are immutable and cache their size, because position arithmetic
 * asks for it constantly.
 */
export class Fragment {
  readonly size: number

  /**
   * Where each child ends, for long runs.
   *
   * Resolving a position used to walk the run from the start, adding sizes
   * until it passed the position. Every keystroke resolves a dozen positions,
   * so on a two-thousand-block document a keystroke near the end cost twelve
   * walks of two thousand children — twelve times what the same keystroke cost
   * at the top. Built on first use, carried across `replaceChild` by shifting
   * the tail, and never built for the short runs inside a paragraph.
   */
  private ends: Uint32Array | null = null

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
    for (let i = 0; i < content.length; i++) total += (content[i] as Node).nodeSize
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
    const content = this.content
    let offset = 0
    for (let index = 0; index < content.length; index++) {
      const node = content[index] as Node
      fn(node, offset, index)
      offset += node.nodeSize
    }
  }

  /** The offset at which child `index` starts. */
  offsetAt(index: number): number {
    if (index <= 0) return 0
    if (index >= this.content.length) return this.size
    if (this.content.length >= INDEX_FROM)
      return (this.ends ?? this.buildEnds())[index - 1] as number
    let offset = 0
    for (let i = 0; i < index; i++) offset += (this.content[i] as Node).nodeSize
    return offset
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
    const delta = node.nodeSize - old.nodeSize
    const out = new Fragment(next, this.size + delta)
    // The index survives the swap: everything after the child moved by the
    // same amount, which is one addition each rather than a size lookup each.
    if (this.ends) {
      const ends = this.ends.slice()
      if (delta !== 0)
        for (let i = index; i < ends.length; i++) ends[i] = (ends[i] as number) + delta
      out.ends = ends
    }
    return out
  }

  /**
   * The same run with the children in `[start, end)` replaced.
   *
   * What a mark change does to a block: it touches a run of children in the
   * middle and leaves both ends alone. Text on either side of the run may join
   * with what arrives, so text takes the canonical route; block children never
   * merge, so the array is spliced and the size adjusted.
   */
  replaceRange(start: number, end: number, nodes: readonly Node[]): Fragment {
    const content = this.content
    let textInvolved = false
    for (let i = start; i < end && !textInvolved; i++)
      textInvolved = (content[i] as Node).isText
    for (let i = 0; i < nodes.length && !textInvolved; i++)
      textInvolved = (nodes[i] as Node).isText
    if (textInvolved || (start > 0 && (content[start - 1] as Node).isText)) {
      return Fragment.from([...content.slice(0, start), ...nodes, ...content.slice(end)])
    }
    if (end < content.length && (content[end] as Node).isText) {
      return Fragment.from([...content.slice(0, start), ...nodes, ...content.slice(end)])
    }
    let size = this.size
    for (let i = start; i < end; i++) size -= (content[i] as Node).nodeSize
    for (let i = 0; i < nodes.length; i++) size += (nodes[i] as Node).nodeSize
    const next = content.slice()
    next.splice(start, end - start, ...nodes)
    return next.length ? new Fragment(next, size) : Fragment.empty
  }

  /** The index and offset of the child containing `pos`. */
  findIndex(pos: number): { index: number; offset: number } {
    if (pos === 0) return { index: 0, offset: 0 }
    if (pos === this.size) return { index: this.content.length, offset: this.size }
    if (pos > this.size || pos < 0) {
      throw new RangeError(`Matra: position ${pos} outside fragment of size ${this.size}`)
    }
    const content = this.content
    if (content.length >= INDEX_FROM) {
      const ends = this.ends ?? this.buildEnds()
      // First child whose end is past the position. A position landing exactly
      // on a boundary belongs to the child that starts there, which is the one
      // whose end is strictly greater.
      let low = 0
      let high = content.length - 1
      while (low < high) {
        const mid = (low + high) >>> 1
        if ((ends[mid] as number) > pos) high = mid
        else low = mid + 1
      }
      return { index: low, offset: low === 0 ? 0 : (ends[low - 1] as number) }
    }
    let offset = 0
    for (let index = 0; index < content.length; index++) {
      const child = content[index] as Node
      const end = offset + child.nodeSize
      if (end > pos) return { index, offset }
      offset = end
    }
    return { index: content.length, offset: this.size }
  }

  private buildEnds(): Uint32Array {
    const content = this.content
    const ends = new Uint32Array(content.length)
    let offset = 0
    for (let i = 0; i < content.length; i++) {
      offset += (content[i] as Node).nodeSize
      ends[i] = offset
    }
    this.ends = ends
    return ends
  }

  /** The slice between two positions, splitting text nodes as needed. */
  cut(from: number, to: number = this.size): Fragment {
    if (from === 0 && to === this.size) return this
    const out: Node[] = []
    if (to <= from) return Fragment.empty
    const content = this.content
    // Start at the first child the cut reaches rather than at zero: cutting the
    // tail off a long run should not cost the head of it.
    const first =
      from <= 0
        ? { index: 0, offset: 0 }
        : from < this.size
          ? this.findIndex(from)
          : { index: content.length, offset: this.size }
    let offset = first.offset
    for (let i = first.index; i < content.length && offset < to; i++) {
      const child = content[i] as Node
      const end = offset + child.nodeSize
      if (end > from) {
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
