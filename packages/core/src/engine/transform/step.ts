import { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import type { ResolvedPos } from '../model/resolved-pos'
import type { Schema } from '../model/schema'
import { Slice } from './slice'
import type { Mapping } from './step-map'
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
  /**
   * Move this step's positions through changes that happened underneath it.
   *
   * Returns null when the step no longer has anything to act on — its range
   * was deleted by the other changes. This is what rebasing a local edit over
   * remote ones amounts to.
   */
  abstract map(mapping: Mapping): Step | null
  abstract toJSON(): Record<string, unknown>
}

/** Rebase a run of steps over changes made since they were created. */
export function rebaseSteps(steps: readonly Step[], over: Mapping): Step[] {
  const out: Step[] = []
  for (const step of steps) {
    const mapped = step.map(over)
    if (mapped) out.push(mapped)
  }
  return out
}

/**
 * Replace everything between two positions with a slice.
 *
 * A replacement that rebuilds structure — a paragraph made a heading, a run
 * of blocks wrapped in a list, an item nested under the one above — keeps
 * nearly all of what it replaces exactly where it was, and only its tokens
 * move. Told nothing, the map treats the whole range as gone and sends every
 * position inside it to the end: the caret jumped to the end of a paragraph
 * that was turned into a heading, and a selection that had just been
 * turned into a list could not be bolded next, because there was no
 * selection left. `ranges` is the finer story, as `[start, oldSize, newSize]`
 * triples over the old document, and the map tells it when it is there.
 */
export class ReplaceStep extends Step {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly slice: Slice,
    readonly ranges: readonly number[] | null = null,
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
    return new StepMap(this.ranges ?? [this.from, this.to - this.from, this.slice.size])
  }

  map(mapping: Mapping): Step | null {
    // The start leans forward and the end leans back, so a range shrinks to
    // nothing rather than swallowing text that arrived beside it.
    const from = mapping.mapResult(this.from, 1)
    const to = mapping.mapResult(this.to, -1)
    if (from.deleted && to.deleted) return null

    // A step that meant "replace this text" whose text is now gone must not
    // become "insert this text here" — that would paste a rewrite into a
    // paragraph the user already deleted.
    const wasRange = this.to > this.from
    if (wasRange && from.pos >= to.pos && (from.deleted || to.deleted)) return null

    const start = Math.min(from.pos, to.pos)
    const end = Math.max(from.pos, to.pos)
    return new ReplaceStep(start, end, this.slice, mapRanges(this.ranges, mapping, start, end))
  }

  /**
   * @param doc the document as it was *before* this step ran
   */
  invert(doc: Node): Step {
    const $from = doc.resolve(this.from)
    const $to = doc.resolve(this.to)
    const ranges = invertRanges(this.ranges)

    if ($from.parent === $to.parent) {
      const removed = $from.parent.content.cut($from.parentOffset, $to.parentOffset)
      return new ReplaceStep(this.from, this.from + this.slice.size, new Slice(removed), ranges)
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
      ranges,
    )
  }

  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      stepType: 'replace',
      from: this.from,
      to: this.to,
      slice: {
        content: this.slice.content.toJSON(),
        openStart: this.slice.openStart,
        openEnd: this.slice.openEnd,
      },
    }
    // A client that does not know the field applies the same replacement
    // and maps the old, coarser way — the documents still agree.
    if (this.ranges) json.ranges = [...this.ranges]
    return json
  }
}

/** The triples that describe undoing `ranges`: each span the other way round. */
function invertRanges(ranges: readonly number[] | null): number[] | null {
  if (!ranges) return null
  const out: number[] = []
  let diff = 0
  for (let i = 0; i < ranges.length; i += 3) {
    const [start, oldSize, newSize] = [ranges[i], ranges[i + 1], ranges[i + 2]] as number[]
    out.push((start as number) + diff, newSize as number, oldSize as number)
    diff += (newSize as number) - (oldSize as number)
  }
  return out
}

/**
 * Bring `ranges` through changes made underneath the step, or give up.
 *
 * Each span's start leans forward and its end leans back, like the step's
 * own range. A span that ends before it starts, or that has left the step's
 * range, means the other changes cut through the structure this step was
 * built on; the plain map is then the honest one.
 */
function mapRanges(
  ranges: readonly number[] | null,
  mapping: Mapping,
  from: number,
  to: number,
): number[] | null {
  if (!ranges) return null
  const out: number[] = []
  let last = from
  for (let i = 0; i < ranges.length; i += 3) {
    const oldSize = ranges[i + 1] as number
    const start = mapping.map(ranges[i] as number, 1)
    const end = mapping.map((ranges[i] as number) + oldSize, -1)
    // Tokens that were there and are not now were deleted underneath.
    if (start < last || end < start || end > to || (oldSize > 0 && end === start)) return null
    out.push(start, end - start, ranges[i + 2] as number)
    last = end
  }
  return out
}

/**
 * Change a node's attributes and nothing else.
 *
 * Done as a replacement, this was a deletion and an insertion of the same
 * size, and every position inside the node — the caret, a marker, a
 * decoration — was mapped to the end of it: aligning a paragraph sent the
 * caret to the end of the paragraph. The content is untouched, so the map
 * says so: the span is reported as changed, which the view needs in order to
 * redraw it, and every position inside it maps to itself.
 */
export class AttrStep extends Step {
  /** Learned when the step is applied; the map is asked for afterwards. */
  private size = 0

  constructor(
    readonly pos: number,
    readonly attrs: Record<string, unknown>,
  ) {
    super()
  }

  apply(doc: Node): StepResult {
    const node =
      this.pos >= 0 && this.pos < doc.content.size ? doc.resolve(this.pos).nodeAfter : null
    if (!node || node.isText) return fail(`no node at ${this.pos} to change the attributes of`)
    let replaced: Node
    try {
      replaced = node.type.create(this.attrs, node.content, node.marks)
    } catch (error) {
      return fail(String(error instanceof Error ? error.message : error))
    }
    this.size = node.nodeSize
    return ok(replaceNodeAt(doc, this.pos + 1, replaced))
  }

  getMap(): StepMap {
    return new StepMap([this.pos, this.size, this.size], false, true)
  }

  map(mapping: Mapping): Step | null {
    const mapped = mapping.mapResult(this.pos, 1)
    // The node this meant is gone, so there is nothing to change.
    if (mapped.deleted || mapped.deletedAfter) return null
    return new AttrStep(mapped.pos, this.attrs)
  }

  /**
   * @param doc the document as it was *before* this step ran
   */
  invert(doc: Node): Step {
    const node = doc.resolve(this.pos).nodeAfter
    return new AttrStep(this.pos, node ? { ...node.attrs } : {})
  }

  toJSON(): Record<string, unknown> {
    return { stepType: 'attr', pos: this.pos, attrs: { ...this.attrs } }
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
      mapTextRange(doc, this.from, this.to, (node, parent) =>
        // A node may say which marks its text can carry · a code block says
        // none, because the text in it is literal. Asked before this, the
        // schema knew that and nothing consulted it, so bold inside a fence
        // produced a document that rendered as something nobody typed.
        parent.type.allowsMarkType(this.mark.type)
          ? node.withMarks(this.mark.addToSet(node.marks))
          : node,
      ),
    )
  }

  getMap(): StepMap {
    // Marks move no text, so positions are untouched.
    return StepMap.empty
  }

  map(mapping: Mapping): Step | null {
    const from = mapping.mapResult(this.from, 1)
    const to = mapping.mapResult(this.to, -1)
    if (from.pos >= to.pos) return null
    return new AddMarkStep(from.pos, to.pos, this.mark)
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

  map(mapping: Mapping): Step | null {
    const from = mapping.mapResult(this.from, 1)
    const to = mapping.mapResult(this.to, -1)
    if (from.pos >= to.pos) return null
    return new RemoveMarkStep(from.pos, to.pos, this.mark)
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

/**
 * Put `node` back where it came from, rebuilding its ancestors.
 *
 * Exactly one child changes at each level, so each level swaps that child
 * rather than cutting the run in two and joining it back around the
 * replacement. On a two-thousand-block document that is the difference between
 * a keystroke costing the document and costing the block.
 */
function replaceNodeAt(doc: Node, contentStart: number, node: Node): Node {
  if (contentStart === 0) return node
  const $at = doc.resolve(contentStart - 1)
  const parent = $at.parent
  const content = parent.content.replaceChild($at.index(), node)
  return replaceNodeAt(doc, $at.start(), parent.copy(content))
}

/**
 * Apply `fn` to every text node touched by the range.
 *
 * Only the children the range reaches are visited, and only the ones that
 * actually changed are swapped into their parent. Marking one word used to
 * rebuild every level of the document from its first child to its last, so a
 * comment on a sentence cost the length of the book it was in.
 */
function mapTextRange(
  doc: Node,
  from: number,
  to: number,
  fn: (node: Node, parent: Node) => Node,
): Node {
  const rebuild = (node: Node, start: number): Node => {
    if (node.isText) return node
    const fragment = node.content
    const content = fragment.content
    const localFrom = Math.max(0, from - start)
    const localTo = Math.min(fragment.size, to - start)
    if (localTo <= localFrom) return node

    if (node.isTextblock) {
      // Inline content: text may split at the range's edges and merge again
      // with what is beside it, so the run is rebuilt in canonical form.
      const children: Node[] = []
      let offset = 0
      let changed = false
      for (let i = 0; i < content.length; i++) {
        const child = content[i] as Node
        const childStart = start + offset
        const childEnd = childStart + child.nodeSize
        offset += child.nodeSize
        if (childEnd <= from || childStart >= to || !child.isText) {
          children.push(child)
          continue
        }
        const text = child.text ?? ''
        const cutFrom = Math.max(0, from - childStart)
        const cutTo = Math.min(text.length, to - childStart)
        const head = text.slice(0, cutFrom)
        const middle = text.slice(cutFrom, cutTo)
        const tail = text.slice(cutTo)
        if (head) children.push(child.withText(head))
        if (middle) {
          const mapped = fn(child.withText(middle), node)
          if (mapped !== child) changed = true
          children.push(mapped)
        }
        if (tail) children.push(child.withText(tail))
        if (head || tail) changed = true
      }
      return changed ? node.copy(Fragment.from(children)) : node
    }

    const begin = fragment.findIndex(localFrom)
    let index = begin.index
    let offset = begin.offset
    let first = -1
    const replaced: Node[] = []
    for (; index < content.length && offset < localTo; index++) {
      const child = content[index] as Node
      const next = rebuild(child, start + offset + 1)
      if (next !== child) {
        if (first === -1) first = index
        // Children between the first change and this one were unchanged, but
        // sit inside the replaced run, so they are carried across as they are.
        while (replaced.length < index - first)
          replaced.push(content[first + replaced.length] as Node)
        replaced.push(next)
      }
      offset += child.nodeSize
    }
    if (first === -1) return node
    return node.copy(fragment.replaceRange(first, first + replaced.length, replaced))
  }
  return rebuild(doc, 0)
}

/**
 * Rebuild a step from JSON.
 *
 * Collaboration needs this: steps travel between clients as data, and a client
 * that cannot reconstruct them cannot apply anyone else's work. Unknown step
 * types return null rather than throwing, so one bad message from a peer does
 * not take the editor down.
 */
export function stepFromJSON(schema: Schema, json: Record<string, unknown>): Step | null {
  if (json.stepType === 'attr') {
    const pos = Number(json.pos)
    const attrs = json.attrs
    if (!Number.isFinite(pos) || !attrs || typeof attrs !== 'object' || Array.isArray(attrs)) {
      return null
    }
    return new AttrStep(pos, { ...(attrs as Record<string, unknown>) })
  }

  const from = Number(json.from)
  const to = Number(json.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null

  switch (json.stepType) {
    case 'replace': {
      const slice = json.slice as
        | { content?: unknown[]; openStart?: number; openEnd?: number }
        | undefined
      const content = (slice?.content ?? []).map((node) => schema.nodeFromJSON(node))
      const ranges =
        Array.isArray(json.ranges) &&
        json.ranges.length % 3 === 0 &&
        json.ranges.every((n) => Number.isFinite(n))
          ? (json.ranges as number[])
          : null
      return new ReplaceStep(
        from,
        to,
        new Slice(Fragment.from(content), slice?.openStart ?? 0, slice?.openEnd ?? 0),
        ranges,
      )
    }
    case 'addMark':
    case 'removeMark': {
      const mark = json.mark as { type?: string; attrs?: Record<string, unknown> } | undefined
      if (!mark?.type || !schema.marks[mark.type]) return null
      const built = schema.mark(mark.type, mark.attrs)
      return json.stepType === 'addMark'
        ? new AddMarkStep(from, to, built)
        : new RemoveMarkStep(from, to, built)
    }
    default:
      return null
  }
}
