import type { Command, MarkDef } from '../types'

/**
 * A key on the keyboard, as in "press <kbd>Ctrl</kbd>".
 *
 * Its own mark rather than `code` with a class: a key name is not code, a
 * screen reader announces the two differently, and a stylesheet wants one
 * drawn as a keycap and the other as monospace text. The two never overlap —
 * `code` already refuses every other mark, and refusing `code` back means
 * toggling kbd over code text swaps one for the other instead of doing
 * nothing and looking broken.
 */
export const kbd = {
  kind: 'mark',
  name: 'kbd' as const,
  excludes: 'code',
  parseDOM: [{ tag: 'kbd' }],
  toDOM: () => ['kbd', 0],
  commands: { toggleKbd: (ctx) => ctx.toggleMark('kbd') },
  keys: { 'Mod-Alt-k': 'toggleKbd' },
} satisfies MarkDef<{ toggleKbd: Command }>
