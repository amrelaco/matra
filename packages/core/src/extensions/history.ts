import { redo as pmRedo, undo as pmUndo } from 'prosemirror-history'
import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'

/**
 * Undo and redo as commands. The keymap is wired by the engine regardless, so
 * this exists for toolbars calling `editor.commands.undo()`.
 */
export const history: ExtensionDef<{ undo: Command; redo: Command }> = {
  kind: 'extension',
  name: 'history',
  commands: {
    undo: (ctx) => engine(ctx).run(pmUndo),
    redo: (ctx) => engine(ctx).run(pmRedo),
  },
}
