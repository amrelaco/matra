import type { Pos, Range } from './types'

/**
 * Turn a number into a position.
 *
 * `Pos` is branded so that arithmetic on one does not typecheck: `from + 5` is
 * a `number`, and a `number` cannot be passed back in. That is the point —
 * a position computed from a stale one is the bug this editor is built to
 * prevent, and it is invisible at runtime.
 *
 * But it also meant that writing a literal position required a cast, and a
 * codebase where `as Pos` is ordinary is a codebase where the cast that hides
 * a real mistake looks like all the others. So: one function, deliberately
 * named, that says you know what you are doing.
 *
 * ```ts
 * editor.commands.select(pos(0))
 * editor.commands.replace(range(1, 6), 'goodbye')
 * ```
 *
 * To move an existing position across an edit, do not use this — use
 * `ctx.mark()`, which maps rather than guesses.
 */
export const pos = (n: number): Pos => n as Pos

/** Two of the above. `range(1, 6)` rather than a pair of casts. */
export const range = (from: number, to: number): Range => ({ from, to }) as Range
