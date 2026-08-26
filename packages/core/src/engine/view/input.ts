import { liftListItem } from '../list-commands'
import { Fragment } from '../model/fragment'
import type { ResolvedPos } from '../model/resolved-pos'
import type { Schema } from '../model/schema'
import type { EditorState } from '../state/state'
import type { Transaction } from '../state/transaction'
import { Slice } from '../transform/slice'
import { ReplaceStep } from '../transform/step'

/**
 * What the user asked the browser to do.
 *
 * `beforeinput` is the modern, declarative version of "the user typed": the
 * browser announces its intent, we apply it to the model ourselves, and the
 * DOM is re-rendered from the result. That is far easier to get right than
 * letting contenteditable mutate and reconstructing what happened afterwards.
 */
export interface InputIntent {
  type: string
  data: string | null
  /** Model range the browser intends to act on. */
  from: number
  to: number
}

export interface InputHandlers {
  /** Return true to say the input was handled and should not be applied. */
  onTextInput?(text: string, from: number, to: number): boolean
  onEnter?(): boolean
  onBackspace?(): boolean
  onDelete?(): boolean
  onPaste?(html: string | null, text: string | null): boolean
}

/**
 * Translate an intent into a transaction.
 *
 * Returns null when nothing should happen — either the handlers claimed it, or
 * the intent is one we deliberately let the browser keep (composition).
 */
export function applyIntent(
  state: EditorState,
  schema: Schema,
  intent: InputIntent,
  handlers: InputHandlers = {},
): Transaction | null {
  const { from, to } = intent

  switch (intent.type) {
    case 'insertText':
    case 'insertReplacementText': {
      const text = intent.data ?? ''
      if (!text) return null
      if (handlers.onTextInput?.(text, from, to)) return null
      const tr = state.tr
      const marks = state.storedMarks ?? state.doc.resolve(from).marks()
      tr.replace(from, to, new Slice(Fragment.from([schema.text(text, marks)])))
      tr.selectAt(from + text.length)
      return tr
    }

    case 'insertParagraph':
    case 'insertLineBreak': {
      if (handlers.onEnter?.()) return null
      return splitBlock(state, from, to)
    }

    case 'deleteContentBackward': {
      if (handlers.onBackspace?.()) return null

      if (from !== to) {
        const tr = state.tr
        tr.delete(from, to)
        tr.selectAt(from)
        return tr
      }

      const $from = state.doc.resolve(from)
      // Inside the text of a block: take the character before the caret.
      if ($from.parentOffset > 0) {
        const tr = state.tr
        tr.delete(from - 1, from)
        tr.selectAt(from - 1)
        return tr
      }

      // At the very start of a block, backspace is not a character delete at
      // all — it joins this block to the one before it, or lifts it out of the
      // list it is in. Treating it as "delete one position back" produces a
      // step that crosses a node boundary, which the schema refuses, and the
      // key appears to do nothing. That is how an empty list item becomes
      // impossible to remove.
      return joinBackward(state, $from)
    }

    case 'deleteContentForward': {
      if (handlers.onDelete?.()) return null
      const tr = state.tr
      const end = from === to ? Math.min(state.doc.content.size, to + 1) : to
      if (from === end) return null
      tr.delete(from, end)
      tr.selectAt(from)
      return tr
    }

    case 'deleteByCut':
    case 'deleteContent': {
      if (from === to) return null
      const tr = state.tr
      tr.delete(from, to)
      tr.selectAt(from)
      return tr
    }

    default:
      return null
  }
}

/**
 * Split the block at the caret, which is what Enter means.
 *
 * The tail of the current block becomes a new block of the same type, so
 * pressing Enter in a heading gives you a paragraph-shaped heading break only
 * if the schema says so — the type is copied, not guessed.
 */
export function splitBlock(state: EditorState, from: number, to: number): Transaction | null {
  const $from = state.doc.resolve(from)
  const parent = $from.parent
  if (!parent.isTextblock) return null

  const tr = state.tr
  if (from !== to) tr.delete(from, to)

  const $at = tr.doc.resolve(tr.mapping.map(from))
  const block = $at.parent
  const offset = $at.parentOffset
  const head = block.content.cut(0, offset)
  const tail = block.content.cut(offset)

  const first = block.copy(head)
  const second = block.copy(tail)

  const blockStart = $at.start() - 1
  const blockEnd = $at.end() + 1
  tr.replaceWith(blockStart, blockEnd, Fragment.from([first, second]))
  // Land the caret at the start of the new block.
  tr.selectAt(blockStart + first.nodeSize + 1)
  return tr
}

/**
 * Backspace at the start of a block.
 *
 * Three things it might mean, tried in the order a person expects:
 * lift the block out of its parent, merge it into the block before it, or —
 * when the thing before it is not text at all, like a rule or an image —
 * remove that.
 */
function joinBackward(state: EditorState, $from: ResolvedPos): Transaction | null {
  const depth = $from.depth
  if (depth === 0) return null

  // An item inside a list gets lifted out rather than merged into the item
  // above it, which is what every editor does and what people expect.
  const parent = $from.node(depth - 1)
  if (depth > 1 && parent.type.name === 'listItem') {
    const itemType = state.schema.nodes.listItem
    if (itemType) {
      const tr = state.tr
      // The caret came from a DOM event, so the state's selection is wherever
      // it was last put. List lifting reads the selection, and reads the wrong
      // one unless it is moved here first.
      tr.selectAt($from.pos)
      if (liftListItem(state, tr, itemType) && tr.docChanged) return tr
    }
  }

  // An empty block inside a wrapper — the empty list item you cannot get rid
  // of — is removed wrapper and all. Merging it into the item above would leave
  // the bullet behind, which is the thing that felt broken.
  if ($from.parent.content.size === 0 && depth > 1) {
    const itemDepth = depth - 1
    const itemStart = $from.before(itemDepth)
    const itemEnd = $from.after(itemDepth)
    const tr = state.tr
    if (tr.maybeStep(new ReplaceStep(itemStart, itemEnd, Slice.empty))) {
      tr.selectAt(Math.max(0, itemStart - 1))
      return tr
    }
  }

  const blockStart = $from.before(depth)
  if (blockStart <= 0) return null

  const tr = state.tr
  // Removing the boundary between the two blocks is what merges them.
  const step = new ReplaceStep(blockStart - 1, blockStart + 1, Slice.empty)
  if (tr.maybeStep(step)) {
    tr.selectAt(blockStart - 1)
    return tr
  }

  // Whatever sits before this block cannot be merged with — a rule, an image,
  // a table. Remove it instead of doing nothing at all.
  const $before = tr.doc.resolve(blockStart)
  const previous = $before.nodeBefore
  if (previous) {
    const removeFrom = blockStart - previous.nodeSize
    const remove = new ReplaceStep(removeFrom, blockStart, Slice.empty)
    if (tr.maybeStep(remove)) {
      tr.selectAt(removeFrom)
      return tr
    }
  }

  return null
}
