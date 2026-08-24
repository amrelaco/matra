import type { ExtensionDef, InputRule } from '../types'

/**
 * The punctuation a writer meant.
 *
 * Straight quotes become curly ones, three dots become an ellipsis, two hyphens
 * become an em dash. All of it happens as you type and all of it is undoable in
 * one step, so a rule that guesses wrong costs one Mod-Z rather than a fight.
 *
 * Quotes are direction-aware: an apostrophe after a letter closes, one after a
 * space opens. Getting that wrong is worse than leaving quotes straight, which
 * is why `don't` is tested and not assumed.
 */
const replace = (match: RegExp, produce: (m: RegExpMatchArray) => string): InputRule => ({
  match,
  handler: (ctx, m, range) => ctx.replace(range, produce(m)),
})

export const typography: ExtensionDef = {
  kind: 'extension',
  name: 'typography',
  inputRules: [
    replace(/\.\.\.$/, () => '…'),
    replace(/--$/, () => '—'),
    // An opening double quote: start of line, or after whitespace or an opener.
    replace(/(^|[\s([{<])"$/, (m) => `${m[1] ?? ''}“`),
    replace(/"$/, () => '”'),
    // An apostrophe inside a word is a closing single quote: don't, it's.
    replace(/(\w)'$/, (m) => `${m[1] ?? ''}’`),
    replace(/(^|[\s([{<])'$/, (m) => `${m[1] ?? ''}‘`),
    replace(/'$/, () => '’'),
    replace(/<-$/, () => '←'),
    replace(/->$/, () => '→'),
    replace(/\(c\)$/i, () => '©'),
    replace(/\(r\)$/i, () => '®'),
    replace(/\(tm\)$/i, () => '™'),
    replace(/\+\/-$/, () => '±'),
    replace(/(\d)\s?x\s?(?=\d)$/, (m) => `${m[1] ?? ''}×`),
  ],
}
