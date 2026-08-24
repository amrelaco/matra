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

/**
 * An immutable set of decorations.
 *
 * Sets are mapped forward through changes rather than recomputed, so a
 * highlight stays on its word while the user types around it.
 */
export class DecorationSet {
  private constructor(readonly items: readonly Decoration[]) {}

  static empty = new DecorationSet([])

  static create(decorations: readonly Decoration[]): DecorationSet {
    return decorations.length ? new DecorationSet([...decorations]) : DecorationSet.empty
  }

  get size(): number {
    return this.items.length
  }

  /** Move every decoration through a change, dropping any that lost its range. */
  map(mapping: Mapping): DecorationSet {
    const out: Decoration[] = []
    for (const item of this.items) {
      if (item.type === 'widget') {
        const mapped = mapping.mapResult(item.pos, item.side && item.side < 0 ? -1 : 1)
        if (mapped.deleted) continue
        out.push({ ...item, pos: mapped.pos })
        continue
      }
      const from = mapping.map(item.from, 1)
      const to = mapping.map(item.to, -1)
      // A decoration whose range collapsed has nothing left to decorate.
      if (to <= from) continue
      out.push({ ...item, from, to })
    }
    return DecorationSet.create(out)
  }

  /** Everything touching a range. */
  find(from = 0, to = Number.POSITIVE_INFINITY): Decoration[] {
    return this.items.filter((item) =>
      item.type === 'widget'
        ? item.pos >= from && item.pos <= to
        : item.to > from && item.from < to,
    )
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

function sameDecoration(a: Decoration, b: Decoration): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'widget' && b.type === 'widget') {
    return a.pos === b.pos && a.key !== undefined && a.key === b.key
  }
  if (a.type === 'widget' || b.type === 'widget') return false
  if (a.from !== b.from || a.to !== b.to) return false
  const keys = Object.keys(a.attrs)
  if (keys.length !== Object.keys(b.attrs).length) return false
  return keys.every((key) => a.attrs[key] === b.attrs[key])
}
