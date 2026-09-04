import { Fragment, type Mark, type MarkType, type Node, type Schema } from './engine/model'
import type { EditorState, Selection as EngineSelection, Transaction } from './engine/state'
import { TextSelection } from './engine/state'
import {
  type Mapping,
  type Step,
  findWrapping,
  insertBlocks,
  liftTarget,
  stepFromJSON,
} from './engine/transform'
import { ENGINE, type EngineAccess, ISOLATE } from './internal'
import type { Ctx, DocNode, Pos, PosMarker, Range, Selection } from './types'

/** The editor internals a Ctx is allowed to see. Deliberately tiny. */
export interface CtxHost {
  readonly schema: Schema
  /** One Mapping per document change ever applied, in order. */
  readonly mappings: Mapping[]
  /** How many mappings were dropped from the front of `mappings`. */
  readonly base: number
  /** A marker was taken; the host keeps the mappings it will need. */
  marker(marker: Marker): void
  focus(): void
  replay(direction: 'undo' | 'redo'): boolean
  canReplay(direction: 'undo' | 'redo'): boolean
}

const asPos = (n: number) => n as Pos

/**
 * Is this a position the document could actually contain?
 *
 * Positions arrive from extensions, collaborative peers and application code.
 * NaN slips through naive range checks — `NaN < 0` and `NaN > size` are both
 * false — so it is rejected explicitly rather than reaching the position maths.
 */
function validPos(value: unknown, size: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= size
}

function toSelection(sel: EngineSelection): Selection {
  return {
    from: asPos(sel.from),
    to: asPos(sel.to),
    anchor: asPos(sel.anchor),
    head: asPos(sel.head),
    empty: sel.empty,
  }
}

/**
 * Does any textblock in this range accept the mark?
 *
 * A range spanning a paragraph and a code block should still bold the
 * paragraph, so this asks whether *anything* can carry it rather than whether
 * everything can.
 */
function acceptsMark(doc: Node, from: number, to: number, type: MarkType): boolean {
  let allowed = false
  doc.nodesBetween(from, to, (node) => {
    if (allowed) return false
    if (!node.isTextblock) return true
    if (node.type.allowsMarkType(type)) allowed = true
    return false
  })
  return allowed
}

/**
 * Turn user content into nodes.
 *
 * A string is inline text — `insert('hi')` types, it does not create a block.
 * Structure is expressed with DocNode objects, which say what they are.
 */
function toNodes(schema: Schema, content: DocNode | DocNode[] | string): Node[] {
  if (typeof content === 'string') {
    return content.length ? [schema.text(content)] : []
  }
  const list = Array.isArray(content) ? content : [content]
  return list.map((node) => schema.nodeFromJSON(node))
}

/** A position marker: the version it was taken at, and the host to ask. */
export class Marker implements PosMarker {
  constructor(
    private readonly host: CtxHost,
    readonly version: number,
  ) {}

  map(pos: Pos): Pos {
    let next: number = pos
    const mappings = this.host.mappings
    for (let i = Math.max(0, this.version - this.host.base); i < mappings.length; i++) {
      next = (mappings[i] as Mapping).map(next)
    }
    return asPos(next)
  }

  mapRange(range: Range): Range {
    return { from: this.map(range.from), to: this.map(range.to) }
  }
}

/** What a read needs: the document, the selection, the stored marks. */
interface Readable {
  readonly doc: Node
  readonly selection: EngineSelection
  readonly storedMarks: readonly Mark[] | null
}

/**
 * The command context.
 *
 * One object with methods on its prototype, rather than an object literal of
 * twenty closures built for every command, every `can`, every `isActive` and
 * every plugin reduce. The transaction is started on first write, so a
 * command that only asks — `can.undo()`, `isActive('bold')` — never builds
 * one, and a decoration hook never pays for a transaction it will not use.
 *
 * @param dry  Nothing built here will be applied · the caller is `editor.can`.
 *   Every other command works by mutating `tr`, so discarding it is enough to
 *   make them harmless. Undo and redo do not: they reach past the transaction
 *   and apply themselves. Without this flag, asking whether undo is available
 *   would perform it.
 */
export class CommandContext implements Ctx, EngineAccess {
  readonly [ENGINE]: EngineAccess
  private transaction: Transaction | null
  private docJSON: DocNode | null = null
  private docFor: Node | null = null

  constructor(
    private readonly host: CtxHost,
    readonly state: EditorState,
    transaction: Transaction | null,
    readonly dry = false,
  ) {
    this.transaction = transaction
    this[ENGINE] = this
  }

  // --- engine access ---------------------------------------------------------

  get schema(): Schema {
    return this.host.schema
  }

  get tr(): Transaction {
    if (!this.transaction) this.transaction = this.state.tr
    return this.transaction
  }

  /** The transaction, if anything started one. */
  get started(): Transaction | null {
    return this.transaction
  }

  /** Where reads come from: the transaction once one exists, the state before. */
  private get current(): Readable {
    return this.transaction ?? this.state
  }

  // Arrow functions rather than methods: an extension is free to write
  // `const { tr, pluginState } = engine(ctx)`, and a method pulled off its
  // object that way has no `this` to read the state from.
  readonly replay = (direction: 'undo' | 'redo'): boolean =>
    this.dry ? this.host.canReplay(direction) : this.host.replay(direction)

  readonly stepFromJSON = (json: Record<string, unknown>): Step | null =>
    stepFromJSON(this.host.schema, json)

  readonly pluginState = (key: string): unknown => this.state.pluginState(key)

  // --- reads -----------------------------------------------------------------

  get doc(): DocNode {
    const doc = this.current.doc
    // The same document serialises to the same JSON, and a command that reads
    // `ctx.doc` twice — compare, then snapshot — should not pay twice.
    if (this.docFor !== doc) {
      this.docJSON = doc.toJSON() as unknown as DocNode
      this.docFor = doc
    }
    return this.docJSON as DocNode
  }

  get selection(): Selection {
    return toSelection(this.current.selection)
  }

  hasMark(name: string, attrs?: Record<string, unknown>): boolean {
    const type = this.host.schema.marks[name]
    if (!type) return false
    const { doc, selection, storedMarks } = this.current
    const { from, to, empty } = selection
    if (empty) {
      const stored = storedMarks ?? selection.$head.marks()
      return stored.some((mark) => mark.type === type)
    }
    let found = false
    let allMarked = true
    doc.nodesBetween(from, to, (node) => {
      if (!allMarked) return false
      if (!node.isText) return undefined
      found = true
      const mark = node.marks.find((m) => m.type === type)
      const matches =
        mark && (!attrs || Object.entries(attrs).every(([k, v]) => mark.attrs[k] === v))
      if (!matches) allMarked = false
      return undefined
    })
    return found && allMarked
  }

  inNode(name: string, attrs?: Record<string, unknown>): boolean {
    const type = this.host.schema.nodes[name]
    if (!type) return false
    const $from = this.current.selection.$from
    for (let depth = $from.depth; depth >= 0; depth--) {
      const node = $from.node(depth)
      if (node.type !== type) continue
      if (!attrs) return true
      if (Object.entries(attrs).every(([k, v]) => node.attrs[k] === v)) return true
    }
    return false
  }

  // --- marks -----------------------------------------------------------------

  private resolveRange(range?: Range): { from: number; to: number } {
    if (range) return { from: range.from, to: range.to }
    const selection = this.current.selection
    return { from: selection.from, to: selection.to }
  }

  addMark(name: string, attrs?: Record<string, unknown>, range?: Range): boolean {
    const type = this.host.schema.marks[name]
    if (!type) return false
    const { from, to } = this.resolveRange(range)

    if (from === to) {
      // A stored mark applies to whatever is typed next, which lands in the
      // block the caret is in · so that block has to accept it.
      if (!this.current.selection.$head.parent.type.allowsMarkType(type)) return false
      this.tr.addStoredMark(type.create(attrs))
      return true
    }

    // Nothing in the range can carry this mark, so the step would apply to
    // nothing. Reporting success for that is how a toolbar lights a button
    // that did not do anything.
    if (!acceptsMark(this.current.doc, from, to, type)) return false

    this.tr.addMark(from, to, type.create(attrs))
    return true
  }

  removeMark(name: string, range?: Range, attrs?: Record<string, unknown>): boolean {
    const type = this.host.schema.marks[name]
    if (!type) return false
    const { from, to } = this.resolveRange(range)

    if (from === to) {
      const { selection, storedMarks } = this.current
      const stored = storedMarks ?? selection.$head.marks()
      const present = stored.find((mark) => mark.type === type)
      if (!present) return false
      this.tr.removeStoredMark(present)
      return true
    }

    // Remove the marks that are actually there. Building one from the type
    // alone fails for marks whose attributes are required, and would remove
    // the wrong thread where several overlap.
    const marks: Mark[] = []
    this.current.doc.nodesBetween(from, to, (node) => {
      if (!node.isText) return undefined
      for (const mark of node.marks) {
        if (mark.type !== type) continue
        if (attrs && !Object.entries(attrs).every(([k, v]) => mark.attrs[k] === v)) continue
        if (!marks.some((existing) => existing.eq(mark))) marks.push(mark)
      }
      return undefined
    })
    if (!marks.length) return false
    for (const mark of marks) this.tr.removeMark(from, to, mark)
    return true
  }

  toggleMark(name: string, attrs?: Record<string, unknown>): boolean {
    return this.hasMark(name, attrs) ? this.removeMark(name) : this.addMark(name, attrs)
  }

  // --- blocks ----------------------------------------------------------------

  setBlockType(name: string, attrs?: Record<string, unknown>): boolean {
    const type = this.host.schema.nodes[name]
    if (!type || !type.isTextblock) return false
    const { from, to } = this.current.selection
    this.tr.setBlockType(from, to, type, attrs)
    return true
  }

  /**
   * Change the attributes of the nearest ancestor of `name`.
   *
   * The counterpart to `setBlockType` for nodes that are not textblocks: a
   * checklist item, a table cell, a callout. Ticking a box is a change to one
   * attribute of a node the caret is *inside*, and there was no way to say
   * that — `setBlockType` refuses anything whose content is blocks rather
   * than text, so the command underneath the checkbox returned false every
   * time and the document never heard about it.
   */
  setNodeAttrs(name: string, attrs: Record<string, unknown>, at?: Pos): boolean {
    const type = this.host.schema.nodes[name]
    if (!type) return false

    // Given a position, use it. A control that already knows which node it
    // belongs to should not have to move the caret onto that node first —
    // clicking a checkbox would then take your cursor with it.
    if (at !== undefined) {
      const doc = this.current.doc
      if (!validPos(at, doc.content.size)) return false
      const node = doc.resolve(at).nodeAfter
      if (!node || node.type !== type) return false
      this.tr.setNodeAttrs(at, attrs ?? {})
      return true
    }

    const $from = this.current.selection.$from
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type !== type) continue
      this.tr.setNodeAttrs($from.before(depth), attrs ?? {})
      return true
    }
    return false
  }

  wrapIn(name: string, attrs?: Record<string, unknown>): boolean {
    const type = this.host.schema.nodes[name]
    if (!type) return false
    const selection = this.current.selection
    const range = selection.$from.blockRange(selection.$to)
    if (!range) return false
    const wrapping = findWrapping(range, type, attrs)
    if (!wrapping) return false
    this.tr.wrap(range, wrapping)
    return true
  }

  lift(): boolean {
    const selection = this.current.selection
    const range = selection.$from.blockRange(selection.$to)
    if (!range) return false
    const target = liftTarget(range)
    if (target === null) return false
    this.tr.lift(range, target)
    return true
  }

  // --- content ---------------------------------------------------------------

  insert(content: DocNode | DocNode[] | string, at?: Pos): boolean {
    const nodes = toNodes(this.host.schema, content)
    if (!nodes.length) return false
    const { doc, selection } = this.current
    const pos = at ?? selection.from
    if (!validPos(pos, doc.content.size)) return false
    if (this.splitAround(pos, pos, nodes)) return true
    this.tr.insert(pos, Fragment.from(nodes))
    return true
  }

  replace(range: Range, content: DocNode | DocNode[] | string): boolean {
    const size = this.current.doc.content.size
    if (!validPos(range.from, size) || !validPos(range.to, size)) return false
    if (range.from > range.to) return false
    const nodes = toNodes(this.host.schema, content)
    if (nodes.length && this.splitAround(range.from, range.to, nodes)) return true
    this.tr.replaceWith(range.from, range.to, Fragment.from(nodes))
    return true
  }

  /**
   * Put blocks where the caret is, by splitting the paragraph around them.
   *
   * A rule or a table cannot go inside a paragraph, and asking for one at a
   * caret in the middle of a sentence used to be refused outright — which is
   * what the toolbar's "rule" button and the `---` shortcut both ask for.
   * The paragraph is cut where the caret is, the blocks go between the halves,
   * and the caret lands after them. When nothing follows, an empty paragraph
   * is left so there is somewhere to keep typing.
   *
   * Returns false when the range is not inside one textblock, or the blocks
   * are not all blocks, so the plain path can have its turn.
   */
  private splitAround(from: number, to: number, nodes: readonly Node[]): boolean {
    const landing = insertBlocks(this.tr, from, to, nodes)
    if (landing === null) return false
    this.tr.selectAt(landing)
    return true
  }

  delete(range?: Range): boolean {
    const { from, to } = this.resolveRange(range)
    const size = this.current.doc.content.size
    if (!validPos(from, size) || !validPos(to, size)) return false
    if (from >= to) return false
    this.tr.delete(from, to)
    return true
  }

  select(range: Range | Pos): boolean {
    // `range` crosses the public boundary, so it may be anything at runtime.
    // Reaching into `.from` of a null is a crash, not a refusal.
    if (typeof range !== 'number' && (range === null || typeof range !== 'object')) return false
    const from = typeof range === 'number' ? range : range.from
    const to = typeof range === 'number' ? range : range.to
    const doc = this.current.doc
    const size = doc.content.size
    if (!validPos(from, size) || !validPos(to, size)) return false
    this.tr.setSelection(TextSelection.create(doc, from, to))
    return true
  }

  moveBlock(from: Pos, to: Pos): boolean {
    const doc = this.current.doc
    const size = doc.content.size
    if (!validPos(from, size) || !validPos(to, size)) return false
    const { index, offset } = doc.content.findIndex(from)
    // Only whole blocks move. A position inside one is not a boundary, and
    // silently moving the block it happens to be in is a surprise.
    if (offset !== from || index >= doc.content.childCount) return false
    const node = doc.content.child(index)
    const cut = { from, to: from + node.nodeSize }
    // Dropping a block inside itself is a no-op, not a delete.
    if (to >= cut.from && to <= cut.to) return false
    // Everything after the removed block shifts back by its size, so the
    // target is mapped through the deletion rather than recomputed.
    const insertAt = to > cut.to ? to - node.nodeSize : to
    this.tr.delete(cut.from, cut.to)
    this.tr.insert(insertAt, node)
    return true
  }

  focus(): boolean {
    this.host.focus()
    return true
  }

  mark(): PosMarker {
    // Mapping index at the moment of the call; every later change adds one.
    const marker = new Marker(this.host, this.host.base + this.host.mappings.length)
    this.host.marker(marker)
    return marker
  }

  isolateUndo(): boolean {
    this.tr.setMeta(ISOLATE, true)
    return true
  }
}

export function createCtx(
  host: CtxHost,
  state: EditorState,
  tr: Transaction | null,
  dry = false,
): CommandContext {
  return new CommandContext(host, state, tr, dry)
}
