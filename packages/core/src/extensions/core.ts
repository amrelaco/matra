import type { Command, DocNode, ExtensionDef, Pos, Range } from '../types'

/**
 * The primitives every editor needs, exposed as commands.
 *
 * Always loaded by createEditor — an editor that cannot move its own selection
 * is not useful, and making callers remember to add it would be a papercut.
 */
export const core: ExtensionDef<{
  select: Command<[Range | Pos]>
  insert: Command<[DocNode | DocNode[] | string, Pos?]>
  replace: Command<[Range, DocNode | DocNode[] | string]>
  remove: Command<[Range?]>
  moveBlock: Command<[Pos, Pos]>
  focus: Command
}> = {
  kind: 'extension',
  name: 'core',
  priority: -100,
  commands: {
    select: (ctx, target) => ctx.select(target),
    insert: (ctx, content, at) => ctx.insert(content, at),
    replace: (ctx, range, content) => ctx.replace(range, content),
    remove: (ctx, range) => ctx.delete(range),
    moveBlock: (ctx, from, to) => ctx.moveBlock(from, to),
    focus: (ctx) => ctx.focus(),
  },
}
