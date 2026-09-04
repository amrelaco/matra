import type { Node, ResolvedPos } from '../engine/model'
import { TextSelection } from '../engine/state'
import { engine } from '../internal'
import type { Command, Ctx, ExtensionDef } from '../types'
import { positionalText } from './block-scan'

type Kind = 'upper' | 'lower' | 'capitalize' | 'sentence' | 'toggle'

const LETTER = /\p{L}/u
/** What a word is made of: letters, digits, and the apostrophe in "don't". */
const WORD = /[\p{L}\p{N}']/u
const STOP = /[.!?]/
const SPACE = /\s/

/** One text node's share of the range. */
interface Run {
  from: number
  to: number
  text: string
  node: Node
  /** The textblock it sits in, so a paragraph break between two runs is noticed. */
  block: Node | null
}

/**
 * A transform fed the runs in document order.
 *
 * Title and sentence case depend on what came before a letter — the previous
 * character, the last full stop — and that may sit in another text node, bold
 * where this one is not. The runs cannot be joined, transformed and split
 * again: once `ß` has become `SS` the lengths no longer line up. So the
 * scanner keeps its state between runs instead.
 */
interface Caser {
  next(text: string): string
  /** A block boundary passed: a new paragraph starts a new word and a new sentence. */
  boundary(): void
}

/** The character before an index, whole even when it is a surrogate pair. */
function charBefore(text: string, index: number): string {
  if (index <= 0) return ''
  const code = text.charCodeAt(index - 1)
  if (code >= 0xdc00 && code <= 0xdfff && index > 1) return text.slice(index - 2, index)
  return text.slice(index - 1, index)
}

/** The character at an index, whole even when it is a surrogate pair. */
function charAt(text: string, index: number): string {
  const code = text.codePointAt(index)
  return code === undefined ? '' : String.fromCodePoint(code)
}

function caser(kind: Kind, runs: readonly Run[]): Caser {
  switch (kind) {
    case 'upper':
      return { next: (text) => text.toLocaleUpperCase(), boundary: () => undefined }
    case 'lower':
      return { next: (text) => text.toLocaleLowerCase(), boundary: () => undefined }
    case 'toggle': {
      // All capitals go down; anything else goes up. Text with no letters in it
      // is not "all capitals", so it goes up — and, unchanged, reports false.
      const whole = runs.map((run) => run.text).join('')
      const allUpper =
        whole === whole.toLocaleUpperCase() && whole !== whole.toLocaleLowerCase()
      return caser(allUpper ? 'lower' : 'upper', runs)
    }
    case 'capitalize': {
      let previous = ''
      return {
        next(text) {
          let out = ''
          for (const ch of text) {
            out += LETTER.test(ch) && !WORD.test(previous) ? ch.toLocaleUpperCase() : ch
            previous = ch
          }
          return out
        },
        boundary() {
          previous = ''
        },
      }
    }
    case 'sentence': {
      let capitalise = true
      let stopped = false
      return {
        next(text) {
          let out = ''
          for (const ch of text) {
            if (LETTER.test(ch)) {
              out += capitalise ? ch.toLocaleUpperCase() : ch.toLocaleLowerCase()
              capitalise = false
              stopped = false
              continue
            }
            out += ch
            if (STOP.test(ch)) stopped = true
            else if (SPACE.test(ch)) capitalise = capitalise || stopped
            else if (WORD.test(ch)) {
              // A digit opens the sentence's first word: "3 apples", not "3 Apples".
              capitalise = false
              stopped = false
            } else stopped = false
          }
          return out
        },
        boundary() {
          capitalise = true
          stopped = false
        },
      }
    }
  }
}

/** The word around a caret, as document positions, or null when it sits in none. */
function wordAround($pos: ResolvedPos): { from: number; to: number } | null {
  const parent = $pos.parent
  if (!parent.isTextblock) return null
  // One character per position, so an inline atom earlier in the block — a
  // mention, an image — does not put the word one place to the left.
  const text = positionalText(parent)
  const offset = $pos.parentOffset
  let start = offset
  for (let ch = charBefore(text, start); ch && WORD.test(ch); ch = charBefore(text, start)) {
    start -= ch.length
  }
  let end = offset
  for (let ch = charAt(text, end); ch && WORD.test(ch); ch = charAt(text, end)) {
    end += ch.length
  }
  if (start === end) return null
  const base = $pos.start()
  return { from: base + start, to: base + end }
}

function apply(ctx: Ctx, kind: Kind): boolean {
  const { tr, schema } = engine(ctx)
  const selection = tr.selection
  let { from, to } = selection
  if (from === to) {
    const word = wordAround(selection.$from)
    if (!word) return false
    from = word.from
    to = word.to
  }

  const runs: Run[] = []
  let block: Node | null = null
  tr.doc.nodesBetween(from, to, (node, pos) => {
    if (node.isTextblock) block = node
    if (!node.isText) return undefined
    const start = Math.max(pos, from)
    const end = Math.min(pos + node.nodeSize, to)
    runs.push({
      from: start,
      to: end,
      text: (node.text ?? '').slice(start - pos, end - pos),
      node,
      block,
    })
    return false
  })
  if (!runs.length) return false

  const transform = caser(kind, runs)
  const changed: Run[] = []
  let previous: Node | null = null
  for (const run of runs) {
    if (previous && run.block !== previous) transform.boundary()
    previous = run.block
    const text = transform.next(run.text)
    if (text !== run.text) changed.push({ ...run, text })
  }
  if (!changed.length) return false

  // Last first, so the positions measured against the old document still
  // point at the right text while the earlier runs wait their turn.
  for (let i = changed.length - 1; i >= 0; i--) {
    const run = changed[i] as Run
    tr.replaceWith(run.from, run.to, schema.text(run.text, run.node.marks))
  }

  // The selection's edges map through the change like any position. A caret
  // inside a word is kept inside it: mapping alone would put a position that
  // sat in replaced text at the end of the replacement, and a caret that only
  // asked for the word around it to change case has no business moving.
  const settle = (pos: number): number => {
    for (const run of changed) {
      if (pos > run.from && pos < run.to) {
        return tr.mapping.map(run.from, -1) + Math.min(pos - run.from, run.text.length)
      }
    }
    return tr.mapping.map(pos)
  }
  tr.setSelection(
    TextSelection.create(tr.doc, settle(selection.anchor), settle(selection.head)),
  )
  return true
}

/**
 * Change the case of the selection, or of the word under the caret.
 *
 * Five commands: `uppercase`, `lowercase`, `capitalize` (the first letter of
 * every word, the rest untouched), `sentenceCase` (the first letter of the
 * selection and of every sentence after a full stop, everything else down)
 * and `toggleCase` (all capitals go down, anything else goes up). With
 * nothing selected each works on the word the caret is in.
 *
 * The text is rewritten one text node at a time, so a bold word stays bold
 * and a link stays a link. Locale-aware casing is used, which is why `ß`
 * becomes `SS` and the selection is mapped afterwards rather than assumed to
 * be the same width. A command that would change nothing returns false.
 */
export const textTransform = {
  kind: 'extension',
  name: 'textTransform',
  commands: {
    uppercase: (ctx) => apply(ctx, 'upper'),
    lowercase: (ctx) => apply(ctx, 'lower'),
    capitalize: (ctx) => apply(ctx, 'capitalize'),
    sentenceCase: (ctx) => apply(ctx, 'sentence'),
    toggleCase: (ctx) => apply(ctx, 'toggle'),
  },
} satisfies ExtensionDef<{
  uppercase: Command
  lowercase: Command
  capitalize: Command
  sentenceCase: Command
  toggleCase: Command
}>
