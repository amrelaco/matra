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
    /* @__PURE__ */ replace(/\.\.\.$/, () => '…'),
    /* @__PURE__ */ replace(/--$/, () => '—'),
    // An opening double quote: start of line, or after whitespace or an opener.
    /* @__PURE__ */ replace(/(^|[\s([{<])"$/, (m) => `${m[1] ?? ''}“`),
    /* @__PURE__ */ replace(/"$/, () => '”'),
    // An apostrophe inside a word is a closing single quote: don't, it's.
    /* @__PURE__ */ replace(/(\w)'$/, (m) => `${m[1] ?? ''}’`),
    /* @__PURE__ */ replace(/(^|[\s([{<])'$/, (m) => `${m[1] ?? ''}‘`),
    /* @__PURE__ */ replace(/'$/, () => '’'),
    /* @__PURE__ */ replace(/<-$/, () => '←'),
    /* @__PURE__ */ replace(/->$/, () => '→'),
    /* @__PURE__ */ replace(/\(c\)$/i, () => '©'),
    /* @__PURE__ */ replace(/\(r\)$/i, () => '®'),
    /* @__PURE__ */ replace(/\(tm\)$/i, () => '™'),
    /* @__PURE__ */ replace(/\+\/-$/, () => '±'),
    /* @__PURE__ */ replace(/(\d)\s?x\s?(?=\d)$/, (m) => `${m[1] ?? ''}×`),
  ],
}
