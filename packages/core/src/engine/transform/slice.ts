import { Fragment } from '../model/fragment'

/**
 * A piece of a document, cut out.
 *
 * `openStart` and `openEnd` say how many levels at each end are "open" — cut
 * through rather than complete. Pasting half a paragraph into another paragraph
 * relies on this: the halves join instead of nesting.
 */
export class Slice {
  constructor(
    readonly content: Fragment,
    readonly openStart = 0,
    readonly openEnd = 0,
  ) {}

  static empty = new Slice(Fragment.empty, 0, 0)

  get size(): number {
    return this.content.size - this.openStart - this.openEnd
  }

  eq(other: Slice): boolean {
    return (
      this.content.eq(other.content) &&
      this.openStart === other.openStart &&
      this.openEnd === other.openEnd
    )
  }

  toString(): string {
    return `${this.content}(${this.openStart},${this.openEnd})`
  }
}
