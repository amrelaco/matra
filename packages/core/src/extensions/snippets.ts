import type { Command, DocNode, ExtensionDef, InputRule } from '../types'

export interface Snippet {
  /** The word that expands. One word — typed whole, then a space. */
  trigger: string
  /** Text, or a node or nodes. Blocks are fine; the paragraph splits around them. */
  content: string | DocNode | DocNode[]
}

export interface SnippetsOptions {
  /** Typed before every trigger, so that `;` makes `sig` fire on `;sig`. Default none. */
  prefix?: string
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const isNode = (value: unknown): value is DocNode =>
  typeof value === 'object' && value !== null && typeof (value as DocNode).type === 'string'

/**
 * Content is the developer's and the schema is the editor's, and the two
 * only meet when somebody types. A snippet naming a node this editor was not
 * built with is refused rather than thrown out of a keystroke: `false`
 * reaches `can.insertSnippet()`, an exception reaches nobody useful.
 */
function place(run: () => boolean): boolean {
  try {
    return run()
  } catch {
    return false
  }
}

/**
 * Words that expand as they are typed.
 *
 * `sig` and a space become a signature, `addr` an address block, `tbl` a
 * table — whatever the application declares. One input rule per snippet, and
 * each matches only a whole word: `sig` typed inside `design` is prose. Text
 * keeps the space that triggered it, so typing carries on naturally; a block
 * stands on its own and the caret lands after it.
 *
 * A bad trigger — empty, or containing whitespace, or declared twice — throws
 * here, at construction. That is a programming error and the place to hear
 * about it is the line that made it, not the first keystroke that did not.
 */
export function snippets(
  list: readonly Snippet[],
  options: SnippetsOptions = {},
): ExtensionDef<{ insertSnippet: Command<[trigger: string]> }> {
  const prefix = options.prefix ?? ''
  if (typeof prefix !== 'string' || /\s/.test(prefix)) {
    throw new Error('Matra: a snippet prefix cannot contain whitespace')
  }

  const contents = new Map<string, Snippet['content']>()
  const rules: InputRule[] = []

  for (const { trigger, content } of list) {
    if (typeof trigger !== 'string' || !trigger || /\s/.test(trigger)) {
      throw new Error(`Matra: snippet trigger ${JSON.stringify(trigger)} must be one word`)
    }
    if (contents.has(trigger)) {
      throw new Error(`Matra: snippet trigger "${trigger}" is declared twice`)
    }
    const valid =
      typeof content === 'string'
        ? content.length > 0
        : Array.isArray(content)
          ? content.length > 0 && content.every(isNode)
          : isNode(content)
    if (!valid) throw new Error(`Matra: snippet "${trigger}" has no content`)
    contents.set(trigger, content)

    const token = prefix + trigger
    rules.push({
      // The whitespace at the end is the character just typed. The one at the
      // start, when there is one, is already in the document and stays.
      match: new RegExp(`(?:^|\\s)${escapeRegExp(token)}\\s$`),
      handler: (ctx, match, range) => {
        const from = (range.to - token.length) as typeof range.from
        if (!place(() => ctx.replace({ from, to: range.to }, content))) return false
        // Text keeps the space; a node stands on its own.
        return typeof content === 'string' ? ctx.insert(match[0].slice(-1)) : true
      },
    })
  }

  return {
    kind: 'extension',
    name: 'snippets',
    inputRules: rules,
    commands: {
      insertSnippet: (ctx, trigger) => {
        const content = contents.get(trigger)
        if (content === undefined) return false
        return place(() => ctx.insert(content))
      },
    },
  }
}
