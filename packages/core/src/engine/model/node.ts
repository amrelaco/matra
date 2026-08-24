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
    if (this.isText) return this.text?.length ?? 0
    return this.isLeaf ? 1 : 2 + this.content.size
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
    for (const child of this.content) out += child.textContent
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
    for (const [child, offset] of this.content.entries()) {
      const start = offset + 1
      const end = offset + child.nodeSize - (child.isText ? 0 : 1)
      if (end <= from || start > to) continue
      if (child.isText) {
        out += (child.text ?? '').slice(Math.max(0, from - offset), Math.max(0, to - offset))
        continue
      }
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
    for (const [child, offset] of this.content.entries()) {
      const pos = start + offset
      if (fn(child, pos) === false) continue
      if (!child.isText) child.descendants(fn, pos + 1)
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
function hasAny(value: Record<string, unknown>): boolean {
  for (const _key in value) return true
  return false
}
