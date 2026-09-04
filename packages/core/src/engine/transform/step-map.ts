/**
 * Position mapping.
 *
 * Every change records which spans it replaced and how long the replacements
 * are. A position taken before the change is moved through those records to
 * find where it now lives. This is what lets a three-second-late AI response
 * land on the words the user selected rather than on whatever now sits at the
 * old coordinates.
 */

export interface MapResult {
  pos: number
  /** True when the position was inside a span that no longer exists. */
  deleted: boolean
  /** True when what stood right after the position was replaced. */
  deletedAfter: boolean
}

/**
 * One change, as a flat list of `[start, oldSize, newSize]` triples.
 *
 * Flat because mapping runs on every keystroke of a collaborative session and
 * allocation shows up.
 */
export class StepMap {
  constructor(
    readonly ranges: readonly number[],
    readonly inverted = false,
    /**
     * The spans changed without moving anything inside them.
     *
     * An attribute change is that: the node is redrawn, so the span is
     * reported to whoever asks what changed, and every position inside it
     * maps to itself, because the content is exactly where it was.
     */
    readonly preserves = false,
  ) {
    if (ranges.length % 3 !== 0) {
      throw new Error('Matra: a step map needs [start, oldSize, newSize] triples')
    }
  }

  static empty = new StepMap([])

  static offset(amount: number): StepMap {
    return amount === 0
      ? StepMap.empty
      : new StepMap([0, amount < 0 ? -amount : 0, amount < 0 ? 0 : amount])
  }

  private start(index: number, diff: number): number {
    const start = this.ranges[index] as number
    return this.inverted ? start + diff : start
  }

  private oldSize(index: number): number {
    return this.ranges[index + (this.inverted ? 2 : 1)] as number
  }

  private newSize(index: number): number {
    return this.ranges[index + (this.inverted ? 1 : 2)] as number
  }

  /**
   * @param assoc which side to favour when a position sits exactly on the
   *   boundary of a replaced span: -1 stays before it, 1 moves after it.
   */
  mapResult(pos: number, assoc: -1 | 1 = 1): MapResult {
    let diff = 0
    for (let i = 0; i < this.ranges.length; i += 3) {
      const start = this.start(i, diff)
      if (start > pos) break

      const oldSize = this.oldSize(i)
      const newSize = this.newSize(i)
      const end = start + oldSize

      if (pos <= end) {
        if (this.preserves) return { pos: pos + diff, deleted: false, deletedAfter: false }
        // Inside the replaced span. An empty span has no inside, so assoc
        // decides; otherwise the ends stick and the middle collapses.
        const side = oldSize === 0 ? assoc : pos === start ? -1 : pos === end ? 1 : assoc
        return {
          pos: start + diff + (side < 0 ? 0 : newSize),
          deleted: pos > start && pos < end,
          deletedAfter: oldSize > 0 && pos < end,
        }
      }
      diff += newSize - oldSize
    }
    return { pos: pos + diff, deleted: false, deletedAfter: false }
  }

  map(pos: number, assoc: -1 | 1 = 1): number {
    return this.mapResult(pos, assoc).pos
  }

  /** The map that undoes this one. */
  invert(): StepMap {
    return new StepMap(this.ranges, !this.inverted, this.preserves)
  }

  forEach(
    fn: (oldStart: number, oldEnd: number, newStart: number, newEnd: number) => void,
  ): void {
    let diff = 0
    for (let i = 0; i < this.ranges.length; i += 3) {
      const start = this.start(i, diff)
      const oldSize = this.oldSize(i)
      const newSize = this.newSize(i)
      const oldStart = this.inverted ? start - diff : start
      fn(
        oldStart,
        oldStart + oldSize,
        start + (this.inverted ? 0 : diff),
        start + (this.inverted ? 0 : diff) + newSize,
      )
      diff += newSize - oldSize
    }
  }

  toString(): string {
    return `${this.inverted ? '-' : ''}[${this.ranges.join(', ')}]`
  }
}

/**
 * An ordered run of step maps.
 *
 * A marker taken at one moment maps through every change recorded after it,
 * in order.
 */
export class Mapping {
  constructor(readonly maps: StepMap[] = []) {}

  get length(): number {
    return this.maps.length
  }

  appendMap(map: StepMap): void {
    this.maps.push(map)
  }

  appendMapping(other: Mapping): void {
    for (const map of other.maps) this.appendMap(map)
  }

  /** Map through maps `from` (inclusive) to `to` (exclusive). */
  slice(from = 0, to: number = this.maps.length): Mapping {
    return new Mapping(this.maps.slice(from, to))
  }

  mapResult(pos: number, assoc: -1 | 1 = 1): MapResult {
    let current = pos
    let deleted = false
    let deletedAfter = false
    for (const map of this.maps) {
      const result = map.mapResult(current, assoc)
      current = result.pos
      if (result.deleted) deleted = true
      if (result.deletedAfter) deletedAfter = true
    }
    return { pos: current, deleted, deletedAfter }
  }

  map(pos: number, assoc: -1 | 1 = 1): number {
    return this.mapResult(pos, assoc).pos
  }

  /** The mapping that undoes this one. */
  invert(): Mapping {
    return new Mapping(this.maps.map((map) => map.invert()).reverse())
  }
}
