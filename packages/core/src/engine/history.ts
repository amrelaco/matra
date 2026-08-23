import type { Node } from './model/node'
import type { Step } from './transform/step'
import type { Transform } from './transform/transform'

export interface HistoryEntry {
  /** Steps that undo the change, in the order they must be applied. */
  steps: Step[]
  /** Selection to restore, as raw positions. */
  selection: { anchor: number; head: number }
  time: number
}

export interface HistoryOptions {
  /** Changes closer together than this are merged into one undo step. */
  groupMs?: number
  depth?: number
}

/**
 * Undo/redo — ours, not ProseMirror's.
 *
 * Each applied transaction is inverted step by step against the document it
 * started from, and the inverse is pushed onto the undo stack. Typing is
 * coalesced by time so a sentence undoes as a sentence, not letter by letter.
 */
export class History {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private readonly groupMs: number
  private readonly depth: number
  /** Set while applying an undo or redo so the result is not recorded again. */
  private replaying: 'undo' | 'redo' | null = null

  constructor(options: HistoryOptions = {}) {
    this.groupMs = options.groupMs ?? 500
    this.depth = options.depth ?? 200
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  /**
   * Record a transaction that has already been applied.
   *
   * @param tr        the applied transform, still holding its step list
   * @param before    the document as it was before the transform
   * @param selection the selection as it was before the transform
   * @param now       injected so tests are not at the mercy of the clock
   */
  record(
    tr: Transform,
    before: Node,
    selection: { anchor: number; head: number },
    now: number,
  ): void {
    if (!tr.steps.length) return

    if (this.replaying) {
      const target = this.replaying === 'undo' ? this.redoStack : this.undoStack
      target.push({ steps: invert(tr), selection, time: now })
      return
    }

    const previous = this.undoStack[this.undoStack.length - 1]
    const inverted = invert(tr)

    if (previous && now - previous.time < this.groupMs) {
      // Merge: the older inverse must run last to rewind in the right order.
      previous.steps = [...inverted, ...previous.steps]
      previous.time = now
    } else {
      this.undoStack.push({ steps: inverted, selection, time: now })
      if (this.undoStack.length > this.depth) this.undoStack.shift()
    }

    // Any new edit invalidates the redo branch.
    this.redoStack = []
    void before
  }

  /** Hand back the entry to replay, and remember which direction we are going. */
  take(direction: 'undo' | 'redo'): HistoryEntry | null {
    const stack = direction === 'undo' ? this.undoStack : this.redoStack
    const entry = stack.pop()
    if (!entry) return null
    this.replaying = direction
    return entry
  }

  finish(): void {
    this.replaying = null
  }
}

/** Invert every step of a transform against the document it was applied to. */
function invert(tr: Transform): Step[] {
  const inverted: Step[] = []
  for (let i = tr.steps.length - 1; i >= 0; i--) {
    const step = tr.steps[i]
    const doc = tr.docs[i]
    if (step && doc) inverted.push(step.invert(doc))
  }
  return inverted
}
