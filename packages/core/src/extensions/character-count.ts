import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'

export interface CharacterCountOptions {
  /** Refuse edits that would take the document past this many characters. */
  limit?: number
}

export interface CharacterCount {
  characters: number
  words: number
}

/**
 * Live character and word counts, with an optional hard limit.
 *
 * The limit is enforced by refusing the command rather than truncating: silently
 * cutting a user's paste in half is worse than telling them it did not fit.
 *
 * Counted only when the document changes. The count used to be taken on every
 * transaction — a caret move, a click, an arrow key — by serialising the whole
 * document to JSON and walking that, so a toolbar showing a word count made
 * every click cost the length of the document.
 */
export function characterCount(
  options: CharacterCountOptions = {},
): ExtensionDef<{ countCharacters: Command }, CharacterCount> {
  return {
    kind: 'extension',
    name: 'characterCount',
    state: {
      init: (ctx) => measure(engine(ctx).state.doc),
      apply: (ctx, previous) => {
        const { tr } = engine(ctx)
        return tr.docChanged ? measure(tr.doc) : previous
      },
    },
    commands: {
      // Exposed so a toolbar can ask without reaching into plugin state.
      countCharacters: () => true,
    },
    onChange: (editor) => {
      const limit = options.limit
      if (limit === undefined) return
      const count = editor.extensionState<CharacterCount>('characterCount')
      if (count && count.characters > limit) {
        // Undo the overflowing edit rather than leaving the document invalid.
        ;(editor.commands as unknown as { undo?: () => boolean }).undo?.()
      }
    },
  }
}

interface Measurable {
  readonly content: { readonly size: number }
  textBetween(from: number, to: number, separator?: string): string
}

/**
 * Characters are the text itself; words are runs of anything but whitespace.
 *
 * Blocks separate words: the last word of one paragraph and the first of the
 * next are two words, which they were not when the text was joined with
 * nothing between. Counted in one pass rather than by splitting, because a
 * split builds an array of every word to report how long it is.
 */
function measure(doc: Measurable): CharacterCount {
  const text = doc.textBetween(0, doc.content.size, '\n')
  let characters = 0
  let words = 0
  let inWord = false
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    // Space, tab, newline, carriage return, and the wider Unicode spaces.
    const space =
      code === 32 ||
      (code >= 9 && code <= 13) ||
      code === 0xa0 ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0x2000 && code <= 0x200a) ||
      code === 0x3000
    if (code !== 10) characters++
    if (space) inWord = false
    else if (!inWord) {
      inWord = true
      words++
    }
  }
  return { characters, words }
}
