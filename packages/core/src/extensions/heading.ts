import type { Command, NodeDef } from '../types'

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

const LEVELS: HeadingLevel[] = [1, 2, 3, 4, 5, 6]

export const heading: NodeDef<{
  setHeading: Command<[HeadingLevel]>
  toggleHeading: Command<[HeadingLevel]>
}> = {
  kind: 'node',
  name: 'heading',
  content: 'inline*',
  group: 'block',
  attrs: { level: { default: 1 } },
  parseDOM: LEVELS.map((level) => ({ tag: `h${level}`, attrs: { level } })),
  toDOM: (node) => [`h${(node.attrs?.level as number) ?? 1}`, 0],
  commands: {
    setHeading: (ctx, level) => ctx.setBlockType('heading', { level }),
    toggleHeading: (ctx, level) =>
      ctx.inNode('heading', { level })
        ? ctx.setBlockType('paragraph')
        : ctx.setBlockType('heading', { level }),
  },
  keys: Object.fromEntries(
    LEVELS.map((level) => [
      `Mod-Alt-${level}`,
      (ctx) => ctx.setBlockType('heading', { level }),
    ]),
  ),
  inputRules: [
    {
      // "## " at the start of a block becomes a level-2 heading.
      match: /^(#{1,6})\s$/,
      handler: (ctx, match, range) => {
        const level = (match[1]?.length ?? 1) as HeadingLevel
        return ctx.delete(range) && ctx.setBlockType('heading', { level })
      },
    },
  ],
}
