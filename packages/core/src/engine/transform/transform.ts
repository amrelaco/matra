import { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import { Slice } from './slice'
import { AddMarkStep, RemoveMarkStep, ReplaceStep, type Step } from './step'
import { Mapping } from './step-map'

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
