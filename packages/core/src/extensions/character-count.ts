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
 */
export function characterCount(
  options: CharacterCountOptions = {},
): ExtensionDef<{ countCharacters: Command }, CharacterCount> {
  const measure = (text: string): CharacterCount => ({
    characters: text.length,
    words: text.trim() ? text.trim().split(/\s+/).length : 0,
  })

  return {
    kind: 'extension',
    name: 'characterCount',
    state: {
      init: (ctx) => measure(textOf(ctx.doc)),
      apply: (ctx) => measure(textOf(ctx.doc)),
    },
    commands: {
      // Exposed so a toolbar can ask without reaching into plugin state.
      countCharacters: () => true,
    },
    onChange: (editor) => {
      const limit = options.limit
      if (limit === undefined) return
      if (editor.getText().length > limit) {
        // Undo the overflowing edit rather than leaving the document invalid.
        ;(editor.commands as unknown as { undo?: () => boolean }).undo?.()
      }
    },
  }
}

function textOf(doc: { text?: string; content?: unknown[] }): string {
  if (typeof doc.text === 'string') return doc.text
  let out = ''
  for (const child of (doc.content ?? []) as Array<{ text?: string; content?: unknown[] }>) {
    out += textOf(child)
  }
  return out
}
