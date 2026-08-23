import type { Command, NodeDef } from '../types'

export const codeBlock: NodeDef<{ toggleCodeBlock: Command<[string?]> }> = {
  kind: 'node',
  name: 'codeBlock',
  content: 'text*',
  group: 'block',
  // Marks are meaningless inside code; the text is literal.
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
    toggleCodeBlock: (ctx, language) =>
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
}
