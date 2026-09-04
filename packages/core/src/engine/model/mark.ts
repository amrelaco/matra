/** Marks — inline formatting attached to text. */

export interface MarkSpec {
  name: string
  /** Order in a mark set; lower sorts first, so serialisation is stable. */
  rank: number
  inclusive?: boolean
  /** Space-separated mark names this one cannot coexist with; `_` means all. */
  excludes?: string
  spanning?: boolean
  attrs?: Record<string, { default?: unknown; required?: boolean }>
  toDOM?: (mark: Mark) => unknown
  parseDOM?: unknown[]
}

export class MarkType {
  constructor(readonly spec: MarkSpec) {}

  get name(): string {
    return this.spec.name
  }

  get rank(): number {
    return this.spec.rank
  }

  create(attrs?: Record<string, unknown> | null): Mark {
    return new Mark(this, resolveAttrs(this.spec.attrs, attrs, this.name))
  }

  /** True when a mark of this type may not sit beside `other`. */
  excludes(other: MarkType): boolean {
    const rule = this.spec.excludes
    if (rule === undefined) return this === other
    if (rule === '_') return true
    return rule.split(/\s+/).includes(other.name)
  }
}

export class Mark {
  constructor(
    readonly type: MarkType,
    readonly attrs: Record<string, unknown>,
  ) {}

  eq(other: Mark): boolean {
    if (this === other) return true
    if (this.type !== other.type) return false
    return sameAttrs(this.attrs, other.attrs)
  }

  /** This mark, if present in `set`. */
  isInSet(set: readonly Mark[]): Mark | null {
    return set.find((mark) => mark.eq(this)) ?? null
  }

  /**
   * Add to a set, keeping rank order and dropping anything excluded.
   * Mark sets are immutable; a new array comes back every time.
   */
  addToSet(set: readonly Mark[]): Mark[] {
    const out: Mark[] = []
    let placed = false
    for (const existing of set) {
      if (this.eq(existing)) return [...set]
      if (this.type.excludes(existing.type)) continue
      if (existing.type.excludes(this.type)) return [...set]
      if (!placed && existing.type.rank > this.type.rank) {
        out.push(this)
        placed = true
      }
      out.push(existing)
    }
    if (!placed) out.push(this)
    return out
  }

  removeFromSet(set: readonly Mark[]): Mark[] {
    return set.filter((mark) => !mark.eq(this))
  }

  toJSON(): { type: string; attrs?: Record<string, unknown> } {
    // Asked once per mark on every text node a document serialises, so the
    // question is answered without building a key array to count.
    for (const _key in this.attrs) return { type: this.type.name, attrs: this.attrs }
    return { type: this.type.name }
  }

  static none: readonly Mark[] = []

  static sameSet(a: readonly Mark[], b: readonly Mark[]): boolean {
    if (a === b) return true
    if (a.length !== b.length) return false
    return a.every((mark, i) => mark.eq(b[i] as Mark))
  }
}

/**
 * The attributes of a node that declares none.
 *
 * One frozen object rather than a fresh `{}` per node: a two-thousand-block
 * document is two thousand paragraphs, and every one of them used to carry its
 * own empty object to say it had nothing to carry. Frozen so that a caller who
 * writes into it finds out, rather than quietly editing every paragraph at once.
 */
const NO_ATTRS: Record<string, unknown> = Object.freeze({})

/** The declared attributes, as entries — read once per type, not once per node. */
const entryCache = new WeakMap<
  Record<string, { default?: unknown; required?: boolean }>,
  Array<[string, { default?: unknown; required?: boolean }]>
>()

function entriesOf(
  spec: Record<string, { default?: unknown; required?: boolean }>,
): Array<[string, { default?: unknown; required?: boolean }]> {
  let entries = entryCache.get(spec)
  if (!entries) {
    entries = Object.entries(spec)
    entryCache.set(spec, entries)
  }
  return entries
}

/** Fill in defaults and reject a missing required attribute loudly. */
export function resolveAttrs(
  spec: Record<string, { default?: unknown; required?: boolean }> | undefined,
  given: Record<string, unknown> | null | undefined,
  owner: string,
): Record<string, unknown> {
  // No declaration means no attributes. Passing unknown keys through is how a
  // node that renders `node.attrs` ends up writing whatever JSON asked for.
  if (!spec) return NO_ATTRS
  const entries = entriesOf(spec)
  if (!entries.length) return NO_ATTRS
  const out: Record<string, unknown> = {}
  for (let i = 0; i < entries.length; i++) {
    const [name, attr] = entries[i] as [string, { default?: unknown; required?: boolean }]
    const value = given?.[name]
    if (value !== undefined) {
      out[name] = value
      continue
    }
    if (attr.required) {
      throw new Error(`Matra: "${owner}" requires the attribute "${name}"`)
    }
    out[name] = attr.default ?? null
  }
  return out
}

export function sameAttrs(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a === b) return true
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}
