import type { Command, NodeDef } from '../types'

export const codeBlock = {
  kind: 'node',
  name: 'codeBlock' as const,
  content: 'text*',
  group: 'block',
  // Marks are meaningless inside code · the text is literal. This line is the
  // difference between saying that in a comment and the schema enforcing it:
  // without it, parsing `<pre><code>x</code></pre>` put a `code` mark on the
  // text and rendered `<pre><code><code>x</code></code></pre>` back out.
  marks: '',
  attrs: { language: { default: null } },
  parseDOM: [
    {
      tag: 'pre',
      getAttrs: (dom) => ({ language: (dom as Element).getAttribute('data-language') }),
    },
  ],
  toDOM: (node) => {
    const language = node.attrs?.language
    return ['pre', language ? { 'data-language': language } : {}, ['code', 0]]
  },
  commands: {
    // Optional in the parameter list, not only in the type it satisfies:
    // inference reads the list, and a required `language` would make
    // `toggleCodeBlock()` — the way every toolbar calls it — a type error.
    toggleCodeBlock: (ctx, language?: string) =>
      ctx.inNode('codeBlock')
        ? ctx.setBlockType('paragraph')
        : ctx.setBlockType('codeBlock', { language: language ?? null }),
  },
  keys: { 'Mod-Alt-c': 'toggleCodeBlock' },
  inputRules: [
    {
      match: /^```([a-z]*)\s$/,
      handler: (ctx, match, range) =>
        ctx.delete(range) && ctx.setBlockType('codeBlock', { language: match[1] || null }),
    },
  ],
} satisfies NodeDef<{ toggleCodeBlock: Command<[string?]> }>
