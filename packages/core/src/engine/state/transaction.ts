import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
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
  private readonly meta = new Map<string, unknown>()

  /** True once something set the selection explicitly. */
  selectionSet = false
  storedMarksSet = false

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
    this.meta.set(key, value)
    return this
  }

  getMeta(key: string): unknown {
    return this.meta.get(key)
  }

  /** Keep the selection sensible as the document moves under it. */
  override step(step: Parameters<Transform['step']>[0]): this {
    const before = this.steps.length
    super.step(step)
    this.remapSelection(before)
    return this
  }

  override maybeStep(step: Parameters<Transform['maybeStep']>[0]): boolean {
    const before = this.steps.length
    const applied = super.maybeStep(step)
    if (applied) this.remapSelection(before)
    return applied
  }

  private remapSelection(fromStep: number): void {
    if (this.steps.length === fromStep) return
    const mapping = this.mapping.slice(fromStep)
    this.selectionValue = this.selectionValue.map(this.doc, mapping)
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
