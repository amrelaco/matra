import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import type { StepMap } from '../transform/step-map'
import { Transform } from '../transform/transform'
import type { Selection } from './selection'
import { TextSelection } from './selection'
import type { EditorState } from './state'

/**
 * A transform that also carries editor intent.
 *
 * Steps change the document; a transaction additionally says where the
 * selection ends up, which marks the next typed character takes, and any
 * metadata plugins want to read.
 */
export class Transaction extends Transform {
  private selectionValue: Selection
  private storedMarksValue: readonly Mark[] | null
  /**
   * Built on first write. Most transactions carry no metadata — every
   * keystroke and every caret move is one — and a Map per transaction was an
   * allocation to hold nothing.
   */
  private meta: Map<string, unknown> | null = null

  /** True once something set the selection explicitly. */
  selectionSet = false
  storedMarksSet = false
  /** True once anything attached metadata — a meta-only transaction is real. */
  metaSet = false

  constructor(state: EditorState) {
    super(state.doc)
    this.selectionValue = state.selection
    this.storedMarksValue = state.storedMarks
  }

  /** The selection, moved through any steps added so far. */
  get selection(): Selection {
    return this.selectionValue
  }

  setSelection(selection: Selection): this {
    this.selectionValue = selection
    this.selectionSet = true
    // Typing after moving the caret should not inherit marks from elsewhere.
    this.storedMarksValue = null
    return this
  }

  get storedMarks(): readonly Mark[] | null {
    return this.storedMarksValue
  }

  setStoredMarks(marks: readonly Mark[] | null): this {
    this.storedMarksValue = marks
    this.storedMarksSet = true
    return this
  }

  addStoredMark(mark: Mark): this {
    const current = this.storedMarksValue ?? this.selection.$head.marks()
    return this.setStoredMarks(mark.addToSet(current))
  }

  removeStoredMark(mark: Mark): this {
    const current = this.storedMarksValue ?? this.selection.$head.marks()
    return this.setStoredMarks(mark.removeFromSet(current))
  }

  setMeta(key: string, value: unknown): this {
    if (!this.meta) this.meta = new Map()
    this.meta.set(key, value)
    this.metaSet = true
    return this
  }

  getMeta(key: string): unknown {
    return this.meta?.get(key)
  }

  /** Keep the selection sensible as the document moves under it. */
  override step(step: Parameters<Transform['step']>[0]): this {
    super.step(step)
    this.remapSelection()
    return this
  }

  override maybeStep(step: Parameters<Transform['maybeStep']>[0]): boolean {
    const applied = super.maybeStep(step)
    if (applied) this.remapSelection()
    return applied
  }

  /**
   * Move the selection through the step just added.
   *
   * Exactly one step landed, so its map is the last one in the mapping and is
   * applied on its own — slicing the mapping to get at it allocated a Mapping
   * and an array for every step of every transaction.
   */
  private remapSelection(): void {
    const maps = this.mapping.maps
    const last = maps[maps.length - 1] as StepMap
    this.selectionValue = this.selectionValue.map(this.doc, last)
  }

  /** Replace the current selection with content, then put the caret after it. */
  replaceSelection(content: Node | readonly Node[]): this {
    const { from, to } = this.selection
    this.replaceWith(from, to, content)
    return this
  }

  /** A caret at a position, resolved against the current document. */
  selectAt(pos: number, head: number = pos): this {
    return this.setSelection(TextSelection.create(this.doc, pos, head))
  }
}
