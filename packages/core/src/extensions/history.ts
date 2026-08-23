import { engine } from '../internal'
import type { Command, ExtensionDef } from '../types'

/**
 * Undo and redo as commands, for toolbars.
 *
 * The engine keeps the stack and binds the keys; these just reach it. The
 * commands return false when there is nothing to rewind, so a button can
 * disable itself.
 */
export const history: ExtensionDef<{ undo: Command; redo: Command }> = {
  kind: 'extension',
  name: 'history',
  commands: {
    undo: (ctx) => engine(ctx).replay('undo'),
    redo: (ctx) => engine(ctx).replay('redo'),
  },
}
