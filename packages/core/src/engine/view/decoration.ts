import type { Mapping } from '../transform/step-map'

/**
 * Things drawn over the document that are not part of it.
 *
 * Search highlights, spelling squiggles, remote cursors, drag targets — none of
 * these belong in the document. Putting them there would mean they travel with
 * every copy, export and collaborative sync, and that undo would have to know
 * about them.
 */
export type Decoration = InlineDecoration | NodeDecoration | WidgetDecoration

export interface InlineDecoration {
  type: 'inline'
  from: number
  to: number
  /** Attributes for the span wrapping the range. */
  attrs: Record<string, string>
}

export interface NodeDecoration {
  type: 'node'
  from: number
  to: number
  attrs: Record<string, string>
}

export interface WidgetDecoration {
  type: 'widget'
  pos: number
  /** Built lazily so a widget that never renders costs nothing. */
  render(): HTMLElement
  /** Which side of the position to sit on when two widgets share it. */
  side?: number
  /** Identity across renders, so an unchanged widget is not rebuilt. */
  key?: string
}

/** Where a decoration begins, whichever kind it is. */
export const startOf = (item: Decoration): number =>
  item.type === 'widget' ? item.pos : item.from
/** Where a decoration ends. */
export const endOf = (item: Decoration): number => (item.type === 'widget' ? item.pos : item.to)

/**
 * An immutable set of decorations.
 *
 * Sets are mapped forward through changes rather than recomputed, so a
 * highlight stays on its word while the user types around it.
 *
 * Items are kept in document order. Two extensions that decorate the same
 * document then produce the same set whichever ran first, and the renderer
 * can find what changed between two sets by comparing from both ends.
 */
export class DecorationSet {
  private constructor(readonly items: readonly Decoration[]) {}

  static empty = new DecorationSet([])

  static create(decorations: readonly Decoration[]): DecorationSet {
    if (!decorations.length) return DecorationSet.empty
    const items = [...decorations]
    let sorted = true
    for (let i = 1; i < items.length && sorted; i++) {
      sorted = startOf(items[i - 1] as Decoration) <= startOf(items[i] as Decoration)
    }
    // A stable sort keeps the order two decorations at one position arrived in.
    if (!sorted) items.sort((a, b) => startOf(a) - startOf(b))
    return new DecorationSet(items)
  }

  get size(): number {
    return this.items.length
  }

  /** Move every decoration through a change, dropping any that lost its range. */
  map(mapping: Mapping): DecorationSet {
    if (!this.items.length) return this
    const out: Decoration[] = []
    for (const item of this.items) {
      if (item.type === 'widget') {
        const mapped = mapping.mapResult(item.pos, item.side && item.side < 0 ? -1 : 1)
        if (mapped.deleted) continue
        out.push(mapped.pos === item.pos ? item : { ...item, pos: mapped.pos })
        continue
      }
      const from = mapping.map(item.from, 1)
      const to = mapping.map(item.to, -1)
      // A decoration whose range collapsed has nothing left to decorate.
      if (to <= from) continue
      out.push(from === item.from && to === item.to ? item : { ...item, from, to })
    }
    return DecorationSet.create(out)
  }

  /** Everything touching a range. */
  find(from = 0, to = Number.POSITIVE_INFINITY): Decoration[] {
    return findIn(this.items, from, to)
  }

  /** True when two sets would draw the same thing, so a redraw can be skipped. */
  eq(other: DecorationSet): boolean {
    if (this === other) return true
    if (this.items.length !== other.items.length) return false
    return this.items.every((item, index) =>
      sameDecoration(item, other.items[index] as Decoration),
    )
  }
}

/** The decorations in a list that touch a range. */
export function findIn(items: readonly Decoration[], from: number, to: number): Decoration[] {
  const out: Decoration[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as Decoration
    if (
      item.type === 'widget'
        ? item.pos >= from && item.pos <= to
        : item.to > from && item.from < to
    ) {
      out.push(item)
    }
  }
  return out
}

export function sameDecoration(a: Decoration, b: Decoration): boolean {
  if (a === b) return true
  if (a.type !== b.type) return false
  if (a.type === 'widget' && b.type === 'widget') {
    return a.pos === b.pos && a.key !== undefined && a.key === b.key
  }
  if (a.type === 'widget' || b.type === 'widget') return false
  if (a.from !== b.from || a.to !== b.to) return false
  return sameAttrs(a.attrs, b.attrs)
}

/** The same attributes, value for value. */
export function sameAttrs(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}

/**
 * The span over which two sets differ, or null when they draw the same thing.
 *
 * Compared from both ends: the common prefix and suffix are what did not
 * change, and whatever is left in the middle of either set is what did. A
 * keystroke inside one paragraph of a document with five hundred search hits
 * moves none of the hits outside that paragraph — once the previous set has
 * been mapped through the edit — so the span comes back as that paragraph and
 * the renderer leaves the other four hundred and ninety-nine alone.
 */
export function changedSpan(
  previous: DecorationSet,
  next: DecorationSet,
): { from: number; to: number } | null {
  const a = previous.items
  const b = next.items
  let head = 0
  const shortest = Math.min(a.length, b.length)
  while (head < shortest && sameDecoration(a[head] as Decoration, b[head] as Decoration)) head++
  if (head === a.length && head === b.length) return null

  let tailA = a.length
  let tailB = b.length
  while (
    tailA > head &&
    tailB > head &&
    sameDecoration(a[tailA - 1] as Decoration, b[tailB - 1] as Decoration)
  ) {
    tailA--
    tailB--
  }

  let from = Number.POSITIVE_INFINITY
  let to = Number.NEGATIVE_INFINITY
  for (let i = head; i < tailA; i++) {
    const item = a[i] as Decoration
    if (startOf(item) < from) from = startOf(item)
    if (endOf(item) > to) to = endOf(item)
  }
  for (let i = head; i < tailB; i++) {
    const item = b[i] as Decoration
    if (startOf(item) < from) from = startOf(item)
    if (endOf(item) > to) to = endOf(item)
  }
  if (from > to) return null
  return { from, to }
}
