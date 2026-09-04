import type { InputRule, Pos, Range } from '../types'

const MAX_LOOKBACK = 120

export interface TextContext {
  /** Text from the start of the current text block up to the caret. */
  before: string
  /** Document position where `before` starts. */
  start: Pos
  from: Pos
  to: Pos
}

/**
 * Input rule matching — the Matra engine's own.
 *
 * A rule fires when its pattern matches the text immediately before the caret,
 * including the character just typed. The matched span is handed to the handler
 * as a range so it can delete or replace it.
 */
export class InputRules {
  constructor(private readonly rules: readonly InputRule[]) {}

  get size(): number {
    return this.rules.length
  }

  /**
   * @param typed the character being inserted
   * @param run   applies a handler; returns whether it consumed the input
   */
  handle(
    context: TextContext,
    typed: string,
    run: (rule: InputRule, match: RegExpMatchArray, range: Range) => boolean,
  ): boolean {
    const text = (context.before + typed).slice(-MAX_LOOKBACK)
    for (const rule of this.rules) {
      const match = text.match(rule.match)
      if (!match) continue
      // The rule replaces exactly the text it matched, caret included.
      const matchedLength = match[0].length
      const from = (context.to - (matchedLength - typed.length)) as Pos
      const range: Range = { from, to: context.to }
      if (run(rule, match, range)) return true
    }
    return false
  }
}
