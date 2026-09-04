import { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import type { NodeRange } from '../model/resolved-pos'
import type { NodeType } from '../model/schema'
import { Slice } from './slice'
import { AddMarkStep, AttrStep, RemoveMarkStep, ReplaceStep, type Step } from './step'
import { Mapping } from './step-map'
import { type Wrapper, canSplit } from './structure'

/**
 * A document plus the steps that got it there.
 *
 * Every method records a step, applies it, and appends its map — so the
 * mapping is always complete and a position taken at any moment can be brought
 * forward to now.
 */
export class Transform {
  readonly steps: Step[] = []
  /** One entry per step: the document as it was before that step. */
  readonly docs: Node[] = []
  readonly mapping = new Mapping()

  constructor(public doc: Node) {}

  get docChanged(): boolean {
    return this.steps.length > 0
  }

  /** Apply a step, or throw with the reason it could not be applied. */
  step(step: Step): this {
    const result = step.apply(this.doc)
    if (result.failed !== undefined) {
      throw new Error(`Matra: ${result.failed}`)
    }
    this.docs.push(this.doc)
    this.steps.push(step)
    this.mapping.appendMap(step.getMap())
    this.doc = result.doc
    return this
  }

  /** Try a step, reporting whether it worked instead of throwing. */
  maybeStep(step: Step): boolean {
    const result = step.apply(this.doc)
    if (result.failed !== undefined) return false
    this.docs.push(this.doc)
    this.steps.push(step)
    this.mapping.appendMap(step.getMap())
    this.doc = result.doc
    return true
  }

  replace(from: number, to: number, slice: Slice = Slice.empty): this {
    return this.step(new ReplaceStep(from, to, slice))
  }

  replaceWith(from: number, to: number, content: Node | readonly Node[] | Fragment): this {
    return this.replace(from, to, new Slice(Fragment.from(content)))
  }

  delete(from: number, to: number): this {
    return this.replace(from, to, Slice.empty)
  }

  insert(pos: number, content: Node | readonly Node[] | Fragment): this {
    return this.replaceWith(pos, pos, content)
  }

  addMark(from: number, to: number, mark: Mark): this {
    return this.step(new AddMarkStep(from, to, mark))
  }

  removeMark(from: number, to: number, mark: Mark): this {
    return this.step(new RemoveMarkStep(from, to, mark))
  }

  /** Wrap a range in one or more node types. */
  wrap(range: NodeRange, wrappers: readonly Wrapper[]): this {
    const covered: Node[] = []
    for (let i = range.startIndex; i < range.endIndex; i++) {
      covered.push(range.parent.child(i))
    }

    // Build inside out: the innermost wrapper holds the content.
    let content = Fragment.from(covered)
    for (let i = wrappers.length - 1; i >= 0; i--) {
      const wrapper = wrappers[i] as Wrapper
      content = Fragment.from([wrapper.type.create(wrapper.attrs, content)])
    }
    return this.replaceWith(range.start, range.end, content)
  }

  /** Remove the wrapper a range sits in. */
  lift(range: NodeRange, target: number): this {
    const $from = range.$from
    const parentStart = $from.start(range.depth) - 1
    const parentEnd = $from.end(range.depth) + 1
    const covered: Node[] = []
    for (let i = range.startIndex; i < range.endIndex; i++) {
      covered.push(range.parent.child(i))
    }
    void target
    return this.replaceWith(parentStart, parentEnd, Fragment.from(covered))
  }

  /** Change the type of every textblock touched by a range. */
  setBlockType(
    from: number,
    to: number,
    type: NodeType,
    attrs?: Record<string, unknown> | null,
  ): this {
    const targets: Array<{ pos: number; node: Node }> = []
    this.doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return undefined
      // Same type with different attributes still needs rewriting — that is
      // how alignment and heading levels change.
      const sameType = node.type === type
      const sameAttrs =
        attrs === undefined ||
        Object.entries(attrs ?? {}).every(([key, value]) => node.attrs[key] === value)
      if (!sameType || !sameAttrs) targets.push({ pos, node })
      // A textblock holds no other blocks, so there is nothing below it to see.
      return false
    })

    // Later first, so earlier positions stay valid as we go.
    for (const target of targets.reverse()) {
      const replacement = type.create(attrs, target.node.content)
      this.replaceWith(target.pos, target.pos + target.node.nodeSize, replacement)
    }
    return this
  }

  /**
   * Change one node's attributes and nothing else.
   *
   * `setBlockType` cannot do this: it only touches textblocks, so a checklist
   * item — whose content is blocks, not text — was silently refused by it, and
   * a checkbox that wrote nothing to the document looked like it worked right
   * up until you saved.
   *
   * The replacement is the same size as what it replaces, so every position
   * inside the node survives and the caret does not move.
   */
  setNodeAttrs(pos: number, attrs: Record<string, unknown>): this {
    const node = this.doc.resolve(pos).nodeAfter
    if (!node || node.isText) return this
    return this.step(new AttrStep(pos, { ...node.attrs, ...attrs }))
  }

  /** Split the textblock at `pos` into two of the same type. */
  split(pos: number): this {
    if (!canSplit(this.doc, pos)) return this
    const $pos = this.doc.resolve(pos)
    const block = $pos.parent
    const first = block.copy(block.content.cut(0, $pos.parentOffset))
    const second = block.copy(block.content.cut($pos.parentOffset))
    return this.replaceWith($pos.start() - 1, $pos.end() + 1, Fragment.from([first, second]))
  }

  /** Every step inverted, in the order that would rewind this transform. */
  invert(): Step[] {
    const out: Step[] = []
    for (let i = this.steps.length - 1; i >= 0; i--) {
      const step = this.steps[i]
      const doc = this.docs[i]
      if (step && doc) out.push(step.invert(doc))
    }
    return out
  }
}
