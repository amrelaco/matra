import type { Command, DocNode, NodeDef } from '../types'

export interface HashtagOptions {
  /** Node name, if you need two kinds of tag in one editor. */
  name?: string
  /** What appears in the document. Defaults to `#tag`. */
  render?: (tag: string) => string
}

/**
 * Letters, digits and combining marks in any script, `_` and `-`; up to
 * sixty-four of them. Marks matter: a Bengali or Hindi word is letters with
 * vowel signs attached, and `\p{L}` alone refuses every one of them.
 */
const TAG = /^[\p{L}\p{N}\p{M}_-]{1,64}$/u

const isTag = (value: unknown): value is string => typeof value === 'string' && TAG.test(value)

/**
 * A hashtag, as a node rather than styled text.
 *
 * The same argument as `mention`: an atom cannot be half-deleted into `#mat`,
 * and a document that stores the tag as an attribute can be asked for its
 * tags without anyone parsing prose. Typing `#word` and a space makes one;
 * `#` inside a word — `a#b`, a colour, a URL fragment — is left alone.
 */
export function hashtag(
  options: HashtagOptions = {},
): NodeDef<{ insertHashtag: Command<[tag: string]> }> {
  const name = options.name ?? 'hashtag'
  const render = options.render ?? ((tag) => `#${tag}`)
  const attribute = `data-${name}`

  return {
    kind: 'node',
    name,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    attrs: { tag: { required: true } },
    parseDOM: [
      {
        tag: `span[${attribute}]`,
        getAttrs: (dom) => {
          const tag = (dom as Element).getAttribute(attribute)
          return isTag(tag) ? { tag } : false
        },
      },
    ],
    toDOM: (node) => {
      const tag = String(node.attrs?.tag ?? '')
      return ['span', { [attribute]: tag, class: `matra-${name}` }, render(tag)]
    },
    commands: {
      insertHashtag: (ctx, tag) =>
        isTag(tag) ? ctx.insert({ type: name, attrs: { tag } }) : false,
    },
    inputRules: [
      {
        // The whitespace at the end is the character just typed. The one at
        // the start, when there is one, is already in the document and stays.
        match: /(?:^|\s)#([\p{L}\p{N}\p{M}_-]{1,64})\s$/u,
        handler: (ctx, match, range) => {
          const tag = match[1] ?? ''
          if (!isTag(tag)) return false
          const from = (range.to - tag.length - 1) as typeof range.from
          if (!ctx.replace({ from, to: range.to }, { type: name, attrs: { tag } })) return false
          // The typed space, after the node rather than in place of it.
          return ctx.insert(match[0].slice(-1))
        },
      },
    ],
  }
}

/**
 * Every tag in a document, in reading order, each once.
 *
 * Walks the JSON rather than the editor, so it works on a document that was
 * saved, on one arriving from a server, and on one nobody has opened.
 */
export function hashtagsIn(doc: DocNode, name = 'hashtag'): string[] {
  const seen = new Set<string>()
  const walk = (node: DocNode): void => {
    const tag = node.attrs?.tag
    if (node.type === name && typeof tag === 'string') seen.add(tag)
    if (!node.content) return
    for (const child of node.content) walk(child)
  }
  walk(doc)
  return [...seen]
}
