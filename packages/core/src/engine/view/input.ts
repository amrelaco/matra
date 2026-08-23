import { Fragment } from '../model/fragment'
import type { Schema } from '../model/schema'
import type { EditorState } from '../state/state'
import type { Transaction } from '../state/transaction'
import { Slice } from '../transform/slice'

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
      const tr = state.tr
      // An empty selection means "remove the character before the caret".
      const start = from === to ? Math.max(0, from - 1) : from
      if (start === to) return null
      tr.delete(start, to)
      tr.selectAt(start)
      return tr
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
