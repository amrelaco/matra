import type { Node } from '../engine/model'
import type { Selection } from '../engine/state'
import { REPLACE_ALL, REPLAY, engine } from '../internal'
import type { Command, Ctx, ExtensionDef } from '../types'
import { type BlockCache, scanBlocks } from './block-scan'

export interface LockedOptions {
  /**
   * Node types that may carry the lock.
   *
   * Defaults to every block the bundled extensions define. A name the editor
   * does not have is ignored, so the default list costs nothing in a small
   * editor and covers the whole of a large one.
   */
  types?: readonly string[]
}

export interface LockedState {
  /** True while the selection is inside a locked node, for a toolbar to read. */
  here: boolean
}

const DEFAULT_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'taskList',
  'table',
  'image',
  'callout',
  'details',
  'youtube',
  'embed',
  'columnList',
  'mathBlock',
  'pageBreak',
  'footnotes',
]

/** Meta on the one kind of transaction a locked node accepts: the lock itself changing. */
const META = 'locked:change'

/** The outermost locked nodes inside one top-level block. */
function lockedWithin(block: Node): Node[] {
  if (block.attrs.locked === true) return [block]
  const out: Node[] = []
  block.descendants((node) => {
    if (node.attrs.locked !== true) return undefined
    out.push(node)
    return false
  })
  return out
}

/** Is the selection inside a locked node, or is it a locked node? */
function hereAt(selection: Selection): boolean {
  const $from = selection.$from
  for (let depth = 1; depth <= $from.depth; depth++) {
    if ($from.node(depth).attrs.locked === true) return true
  }
  if (selection.empty) return false
  const after = $from.nodeAfter
  return (
    after !== null &&
    after.attrs.locked === true &&
    after.nodeSize === selection.to - selection.from
  )
}

/**
 * Blocks that refuse to change.
 *
 * A contract with clauses nobody may edit and blanks they may; a form letter
 * whose greeting is fixed; a template where the headings stay and the prose
 * beneath them is yours. Every editor makes the whole document editable or
 * none of it, and the gap between those is what this fills.
 *
 * The lock is an attribute, so it travels with the document, and the guard is
 * a change filter rather than a read-only view: a keystroke, a paste, a drop,
 * a drag and a command that would alter a locked node are all refused the
 * same way, because all of them are changes. Nothing that leaves a locked
 * node exactly as it was is refused — typing beside it, moving it, moving
 * something past it — because nodes are immutable and an untouched node keeps
 * its identity: every locked node of the old document has to be present, as
 * the same object, in the new one. Top-level blocks nothing touched are the
 * same objects too, so their locked nodes come out of a cache and the check
 * costs the blocks that changed.
 *
 * The lock itself is the one edit a locked node accepts, and undo of a lock
 * is another, so `lock`, `unlock` and history all pass. `setContent` replaces
 * the document rather than editing it and passes too.
 */
export function locked(
  options: LockedOptions = {},
): ExtensionDef<{ lock: Command; unlock: Command; toggleLock: Command }, LockedState> {
  const types = new Set(options.types ?? DEFAULT_TYPES)
  const cache: BlockCache<Node[]> = new WeakMap()

  /** The outermost lockable nodes the selection touches. */
  const targets = (ctx: Ctx): Array<{ pos: number; node: Node }> => {
    const { tr } = engine(ctx)
    const { from, to, $from } = tr.selection
    const out: Array<{ pos: number; node: Node }> = []
    if (from === to) {
      for (let depth = 1; depth <= $from.depth; depth++) {
        const node = $from.node(depth)
        if (!types.has(node.type.name)) continue
        out.push({ pos: $from.before(depth), node })
        return out
      }
      const after = $from.nodeAfter
      if (after && types.has(after.type.name)) out.push({ pos: from, node: after })
      return out
    }
    tr.doc.nodesBetween(from, to, (node, pos) => {
      if (!types.has(node.type.name)) return undefined
      out.push({ pos, node })
      return false
    })
    return out
  }

  const set = (ctx: Ctx, value: boolean): boolean => {
    const { tr } = engine(ctx)
    let changed = false
    for (const { pos, node } of targets(ctx)) {
      if ((node.attrs.locked === true) === value) continue
      tr.setNodeAttrs(pos, { locked: value })
      changed = true
    }
    if (changed) tr.setMeta(META, true)
    return changed
  }

  return {
    kind: 'extension',
    name: 'locked',

    attributes: [
      {
        types: [...types],
        attrs: {
          locked: {
            default: false,
            render: (value) => (value === true ? { 'data-locked': 'true' } : null),
            parse: (dom) => dom.getAttribute('data-locked') === 'true',
          },
        },
      },
    ],

    filterChange(ctx) {
      const { state, tr } = engine(ctx)
      if (!tr.docChanged) return true
      if (
        tr.getMeta(META) === true ||
        tr.getMeta(REPLAY) !== undefined ||
        tr.getMeta(REPLACE_ALL) === true
      ) {
        return true
      }
      const before: Node[] = []
      scanBlocks(state.doc, cache, lockedWithin, (nodes) => {
        for (const node of nodes) before.push(node)
      })
      if (!before.length) return true
      // Identity is the whole test: a node nothing touched is the same object
      // in the new document, and one that was edited, however slightly, or
      // deleted, is not there.
      const after = new Set<Node>()
      scanBlocks(tr.doc, cache, lockedWithin, (nodes) => {
        for (const node of nodes) after.add(node)
      })
      for (const node of before) if (!after.has(node)) return false
      return true
    },

    state: {
      init: (ctx) => ({ here: hereAt(engine(ctx).state.selection) }),
      apply: (ctx, previous) => {
        const { tr } = engine(ctx)
        if (!tr.docChanged && !tr.selectionSet) return previous
        const here = hereAt(tr.selection)
        return here === previous.here ? previous : { here }
      },
    },

    commands: {
      lock: (ctx) => set(ctx, true),
      unlock: (ctx) => set(ctx, false),
      toggleLock: (ctx) => {
        const found = targets(ctx)
        if (!found.length) return false
        return set(ctx, !found.every((target) => target.node.attrs.locked === true))
      },
    },
  }
}

export const lockedCSS = `
[data-locked="true"] {
  border-left: 3px solid var(--matra-locked, #c8c8c8);
  padding-left: 0.6em;
  caret-color: transparent;
}
`
