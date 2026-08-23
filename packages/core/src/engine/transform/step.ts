import { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import type { ResolvedPos } from '../model/resolved-pos'
import { Slice } from './slice'
import { StepMap } from './step-map'

/** What applying a step produced, or why it could not be applied. */
export type StepResult = { doc: Node; failed?: undefined } | { doc?: undefined; failed: string }

const ok = (doc: Node): StepResult => ({ doc })
const fail = (failed: string): StepResult => ({ failed })

/**
 * The smallest unit of change.
 *
 * A step knows how to apply itself, how to describe the positions it moved,
 * and how to undo itself — which is what makes history and collaboration
 * possible without re-diffing documents.
 */
export abstract class Step {
  abstract apply(doc: Node): StepResult
  abstract getMap(): StepMap
  abstract invert(doc: Node): Step
  abstract toJSON(): Record<string, unknown>
}

/** Replace everything between two positions with a slice. */
export class ReplaceStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly slice: Slice,
  ) {
    super()
    if (from > to) throw new RangeError(`Matra: replace step with from ${from} after to ${to}`)
  }

  apply(doc: Node): StepResult {
    if (this.to > doc.content.size) {
      return fail(`replace to ${this.to} is past the end of the document`)
    }
    const replaced = replaceRange(doc, this.from, this.to, this.slice)
    return replaced ? ok(replaced) : fail('that replacement would break the schema')
  }

  getMap(): StepMap {
    return new StepMap([this.from, this.to - this.from, this.slice.size])
  }

  /**
   * @param doc the document as it was *before* this step ran
   */
  invert(doc: Node): Step {
    const $from = doc.resolve(this.from)
    const $to = doc.resolve(this.to)

    if ($from.parent === $to.parent) {
      const removed = $from.parent.content.cut($from.parentOffset, $to.parentOffset)
      return new ReplaceStep(this.from, this.from + this.slice.size, new Slice(removed))
    }

    // Across blocks the step rebuilt a whole region, so undoing it means
    // putting the original region back where the rebuilt one now sits.
    const plan = planReplace($from, $to, this.slice)
    if (!plan) throw new Error('Matra: cannot invert that replacement')
    const { shared, sharedStart, regionStart, regionEnd, middle } = plan

    const original = shared.content.cut(regionStart, regionEnd)
    let rebuiltSize = 0
    for (const node of middle) rebuiltSize += node.nodeSize

    return new ReplaceStep(
      sharedStart + regionStart,
      sharedStart + regionStart + rebuiltSize,
      new Slice(original),
    )
  }

  toJSON(): Record<string, unknown> {
    return {
      stepType: 'replace',
      from: this.from,
      to: this.to,
      slice: {
        content: this.slice.content.toJSON(),
        openStart: this.slice.openStart,
        openEnd: this.slice.openEnd,
      },
    }
  }
}

/** Add a mark across a range. */
export class AddMarkStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly mark: Mark,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    return ok(
      mapTextRange(doc, this.from, this.to, (node) =>
        node.withMarks(this.mark.addToSet(node.marks)),
      ),
    )
  }

  getMap(): StepMap {
    // Marks move no text, so positions are untouched.
    return StepMap.empty
  }

  invert(): Step {
    return new RemoveMarkStep(this.from, this.to, this.mark)
  }

  toJSON(): Record<string, unknown> {
    return { stepType: 'addMark', from: this.from, to: this.to, mark: this.mark.toJSON() }
  }
}

/** Remove a mark across a range. */
export class RemoveMarkStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly mark: Mark,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    return ok(
      mapTextRange(doc, this.from, this.to, (node) =>
        node.withMarks(this.mark.removeFromSet(node.marks)),
      ),
    )
  }

  getMap(): StepMap {
    return StepMap.empty
  }

  invert(): Step {
    return new AddMarkStep(this.from, this.to, this.mark)
  }

  toJSON(): Record<string, unknown> {
    return { stepType: 'removeMark', from: this.from, to: this.to, mark: this.mark.toJSON() }
  }
}

// --- the document surgery ---------------------------------------------------

/**
 * Replace a range with a slice.
 *
 * Handles the shapes the editor actually produces: inline edits inside one
 * textblock, and whole-node edits at a shared depth. Anything else returns null
 * rather than guessing, so a step fails loudly instead of corrupting a document.
 */
function replaceRange(doc: Node, from: number, to: number, slice: Slice): Node | null {
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)

  // Same parent: splice its content directly.
  if ($from.parent === $to.parent) {
    const parent = $from.parent
    const content = parent.content
      .cut(0, $from.parentOffset)
      .append(slice.content)
      .append(parent.content.cut($to.parentOffset))
    if (!parent.type.validContent(content)) return null
    return replaceNodeAt(doc, $from.start(), parent.copy(content))
  }

  const plan = planReplace($from, $to, slice)
  if (!plan) return null
  const { shared, sharedStart, regionStart, regionEnd, middle } = plan

  const content = shared.content
    .cut(0, regionStart)
    .append(Fragment.from(middle))
    .append(shared.content.cut(regionEnd))
  if (!shared.type.validContent(content)) return null
  return replaceNodeAt(doc, sharedStart, shared.copy(content))
}

interface ReplacePlan {
  shared: Node
  sharedStart: number
  /** Offsets within `shared.content` of the region being rebuilt. */
  regionStart: number
  regionEnd: number
  /** What replaces that region. */
  middle: Node[]
}

/**
 * Work out what a cross-block replacement rebuilds.
 *
 * Either end may sit inside a block or on a boundary between blocks, which
 * gives four shapes:
 *
 *   - both inside  — the two blocks join, keeping the head of one and the tail
 *     of the other; this is what backspace at a boundary means
 *   - start inside — the first block keeps its head and absorbs the slice
 *   - end inside   — the last block keeps its tail and absorbs the slice
 *   - both on boundaries — whole blocks are swapped out
 */
function planReplace($from: ResolvedPos, $to: ResolvedPos, slice: Slice): ReplacePlan | null {
  const depth = $from.sharedDepth($to)
  const shared = $from.node(depth)
  const sharedStart = $from.start(depth)

  const fromInside = $from.depth > depth
  const toInside = $to.depth > depth
  // Deeper nesting than one level is not handled yet; failing beats guessing.
  if ((fromInside && $from.depth !== depth + 1) || (toInside && $to.depth !== depth + 1)) {
    return null
  }

  const regionStart = fromInside
    ? $from.start(depth + 1) - 1 - sharedStart
    : $from.pos - sharedStart
  const regionEnd = toInside ? $to.end(depth + 1) + 1 - sharedStart : $to.pos - sharedStart

  const head = fromInside ? $from.node(depth + 1).content.cut(0, $from.parentOffset) : null
  const tail = toInside ? $to.node(depth + 1).content.cut($to.parentOffset) : null

  let middle: Node[]
  if (head && tail) {
    const first = $from.node(depth + 1)
    middle = [first.copy(head.append(slice.content).append(tail))]
  } else if (head) {
    const first = $from.node(depth + 1)
    middle = [first.copy(head.append(slice.content))]
  } else if (tail) {
    const last = $to.node(depth + 1)
    middle = [last.copy(slice.content.append(tail))]
  } else {
    middle = [...slice.content]
  }

  return { shared, sharedStart, regionStart, regionEnd, middle }
}

/** Put `node` back where it came from, rebuilding its ancestors. */
function replaceNodeAt(doc: Node, contentStart: number, node: Node): Node {
  if (contentStart === 0) return node
  const $at = doc.resolve(contentStart - 1)
  const parent = $at.parent
  const index = $at.index()
  const content = parent.content
    .cut(0, $at.parentOffset)
    .append(Fragment.from([node]))
    .append(parent.content.cut($at.parentOffset + parent.child(index).nodeSize))
  return replaceNodeAt(doc, $at.start(), parent.copy(content))
}

/** Apply `fn` to every text node touched by the range. */
function mapTextRange(doc: Node, from: number, to: number, fn: (node: Node) => Node): Node {
  const rebuild = (node: Node, start: number): Node => {
    if (node.isText) return node
    const children: Node[] = []
    for (const [child, offset] of node.content.entries()) {
      const childStart = start + offset
      const childEnd = childStart + child.nodeSize
      if (childEnd <= from || childStart >= to) {
        children.push(child)
        continue
      }
      if (child.isText) {
        const text = child.text ?? ''
        const localFrom = Math.max(0, from - childStart)
        const localTo = Math.min(text.length, to - childStart)
        const head = text.slice(0, localFrom)
        const middle = text.slice(localFrom, localTo)
        const tail = text.slice(localTo)
        if (head) children.push(child.withText(head))
        if (middle) children.push(fn(child.withText(middle)))
        if (tail) children.push(child.withText(tail))
        continue
      }
      children.push(rebuild(child, childStart + 1))
    }
    return node.copy(Fragment.from(children))
  }
  return rebuild(doc, 0)
}
