import { Fragment } from './fragment'
import { Mark, sameAttrs } from './mark'
import { ResolvedPos } from './resolved-pos'
import type { NodeType } from './schema'

/** A document node. Immutable; every change returns a new one. */
export class Node {
  constructor(
    readonly type: NodeType,
    readonly attrs: Record<string, unknown>,
    readonly content: Fragment = Fragment.empty,
    readonly marks: readonly Mark[] = Mark.none,
    readonly text?: string,
  ) {}

  get isText(): boolean {
    return this.text !== undefined
  }

  get isLeaf(): boolean {
    return this.type.isLeaf
  }

  get isBlock(): boolean {
    return this.type.isBlock
  }

  get isInline(): boolean {
    return this.type.isInline
  }

  get isTextblock(): boolean {
    return this.type.isTextblock
  }

  /** Text nodes measure their characters; everything else counts its borders. */
  get nodeSize(): number {
    if (this.text !== undefined) return this.text.length
    return this.type.isLeaf ? 1 : 2 + this.content.size
  }

  get childCount(): number {
    return this.content.childCount
  }

  child(index: number): Node {
    return this.content.child(index)
  }

  get firstChild(): Node | null {
    return this.content.firstChild
  }

  get lastChild(): Node | null {
    return this.content.lastChild
  }

  get textContent(): string {
    if (this.isText) return this.text ?? ''
    let out = ''
    const content = this.content.content
    for (let i = 0; i < content.length; i++) out += (content[i] as Node).textContent
    return out
  }

  /** Same type, same attributes, same marks — ignoring content. */
  sameMarkup(other: Node): boolean {
    return (
      this.type === other.type &&
      sameAttrs(this.attrs, other.attrs) &&
      Mark.sameSet(this.marks, other.marks)
    )
  }

  eq(other: Node): boolean {
    if (this === other) return true
    if (!this.sameMarkup(other)) return false
    if (this.isText) return this.text === other.text
    return this.content.eq(other.content)
  }

  copy(content: Fragment = this.content): Node {
    if (content === this.content) return this
    return new Node(this.type, this.attrs, content, this.marks, this.text)
  }

  withMarks(marks: readonly Mark[]): Node {
    if (Mark.sameSet(marks, this.marks)) return this
    return new Node(this.type, this.attrs, this.content, marks, this.text)
  }

  withText(text: string): Node {
    if (!this.isText) throw new Error('Matra: withText on a non-text node')
    return new Node(this.type, this.attrs, this.content, this.marks, text)
  }

  cutText(from: number, to: number): Node {
    if (!this.isText) throw new Error('Matra: cutText on a non-text node')
    return this.withText((this.text ?? '').slice(from, to))
  }

  /** Text between two positions inside this node, with block separators. */
  textBetween(from: number, to: number, blockSeparator = ''): string {
    if (this.isText) return (this.text ?? '').slice(from, to)
    let out = ''
    let first = true
    const content = this.content.content
    // Start at the child the range reaches: the text of one paragraph near the
    // end of a long document should not cost a walk from the top.
    const begin = from > 0 && from < this.content.size ? this.content.findIndex(from) : null
    let offset = begin ? begin.offset : 0
    for (let i = begin ? begin.index : 0; i < content.length && offset < to; i++) {
      const child = content[i] as Node
      const size = child.nodeSize
      if (child.text !== undefined) {
        if (offset + size > from) {
          out += child.text.slice(Math.max(0, from - offset), Math.max(0, to - offset))
        }
        offset += size
        continue
      }
      const start = offset + 1
      const end = offset + size - 1
      offset += size
      if (end <= from || start > to) continue
      const inner = child.textBetween(
        Math.max(0, from - start),
        Math.min(child.content.size, to - start),
        blockSeparator,
      )
      if (!inner) continue
      if (!first && child.isBlock) out += blockSeparator
      out += inner
      first = false
    }
    return out
  }

  /** Walk every descendant, depth first, with its absolute position. */
  descendants(fn: (node: Node, pos: number) => boolean | undefined, start = 0): void {
    const content = this.content.content
    let offset = 0
    for (let i = 0; i < content.length; i++) {
      const child = content[i] as Node
      const pos = start + offset
      if (fn(child, pos) !== false && child.text === undefined) child.descendants(fn, pos + 1)
      offset += child.nodeSize
    }
  }

  /**
   * Walk only the descendants a range touches.
   *
   * `descendants` visits the whole tree and lets the callback say no to each
   * node, which means asking about one selected word costs the size of the
   * document. This jumps to the first child the range reaches and stops at the
   * last, so the cost is the range plus the depth. `from` and `to` are absolute
   * positions; `start` is where this node's content begins.
   */
  nodesBetween(
    from: number,
    to: number,
    fn: (node: Node, pos: number) => boolean | undefined,
    start = 0,
  ): void {
    const size = this.content.size
    const localTo = to - start
    if (localTo <= 0) return
    const localFrom = Math.max(0, from - start)
    if (localFrom >= size) return
    const content = this.content.content
    const begin = this.content.findIndex(localFrom)
    let offset = begin.offset
    for (let i = begin.index; i < content.length && offset < localTo; i++) {
      const child = content[i] as Node
      const pos = start + offset
      if (fn(child, pos) !== false && child.text === undefined && child.content.size) {
        child.nodesBetween(from, to, fn, pos + 1)
      }
      offset += child.nodeSize
    }
  }

  /** Resolve a position inside this node. */
  resolve(pos: number): ResolvedPos {
    return ResolvedPos.resolve(this, pos)
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = { type: this.type.name }
    // `Object.keys(x).length` allocates an array to ask whether one is empty.
    // Serialising a long document asks that once per node, and the allocations
    // cost more than the serialising.
    if (hasAny(this.attrs)) out.attrs = this.attrs
    if (this.isText) out.text = this.text
    else if (this.content.childCount) out.content = this.content.toJSON()
    if (this.marks.length) out.marks = this.marks.map((mark) => mark.toJSON())
    return out
  }

  toString(): string {
    if (this.isText) return JSON.stringify(this.text)
    return this.content.childCount ? `${this.type.name}(${this.content})` : this.type.name
  }
}

/** Does this object have any own enumerable key? Asked without allocating. */
export function hasAny(value: Record<string, unknown>): boolean {
  for (const _key in value) return true
  return false
}
