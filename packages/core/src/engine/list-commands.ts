import { Fragment, type NodeType, Slice } from 'prosemirror-model'
import type { EditorState, Transaction } from 'prosemirror-state'
import { ReplaceAroundStep, canSplit, findWrapping, liftTarget } from 'prosemirror-transform'

/**
 * List editing — ours, not prosemirror-schema-list.
 *
 * These operate directly on the transaction the command is building, so they
 * compose with everything else in the same undo step.
 */

/** Split the list item at the cursor, the way Enter should behave. */
export function splitListItem(
  state: EditorState,
  tr: Transaction,
  itemType: NodeType,
): boolean {
  const { $from, $to } = tr.selection
  if (!tr.selection.empty && $from.parent !== $to.parent) return false

  const grandParent = $from.node(-1)
  if (grandParent.type !== itemType) return false

  // Empty item inside a list: Enter lifts it out instead of adding another.
  if ($from.parent.content.size === 0 && $from.node(-1).childCount === $from.indexAfter(-1)) {
    return liftListItem(state, tr, itemType)
  }

  const depth = $from.depth - 1
  if (!canSplit(tr.doc, $from.pos, depth)) return false
  tr.split($from.pos, depth)
  return true
}

/** Pull the item out one level, or out of the list entirely. */
export function liftListItem(state: EditorState, tr: Transaction, itemType: NodeType): boolean {
  const { $from, $to } = tr.selection
  const range = $from.blockRange(
    $to,
    (node) => node.childCount > 0 && node.firstChild?.type === itemType,
  )
  if (!range) return false

  const target = liftTarget(range)
  if (target == null) return false
  tr.lift(range, target)
  return true
}

/** Push the item one level deeper, nesting it under its previous sibling. */
export function sinkListItem(state: EditorState, tr: Transaction, itemType: NodeType): boolean {
  const { $from, $to } = tr.selection
  const range = $from.blockRange(
    $to,
    (node) => node.childCount > 0 && node.firstChild?.type === itemType,
  )
  if (!range) return false

  const startIndex = range.startIndex
  // Nothing to nest under: the item is already first in its list.
  if (startIndex === 0) return false

  const parent = range.parent
  const previous = parent.child(startIndex - 1)
  if (previous.type !== itemType) return false

  const nestedBefore = previous.lastChild && previous.lastChild.type === parent.type
  const inner = Fragment.from(nestedBefore ? itemType.create() : null)
  const slice = new Slice(
    Fragment.from(itemType.create(null, Fragment.from(parent.type.create(null, inner)))),
    nestedBefore ? 3 : 1,
    0,
  )
  const before = range.start
  const after = range.end
  tr.step(
    new ReplaceAroundStep(
      before - (nestedBefore ? 3 : 1),
      after,
      before,
      after,
      slice,
      1,
      true,
    ),
  )
  return true
}

/** Wrap the selection in a list, or unwrap it when already inside one. */
export function toggleList(
  tr: Transaction,
  listType: NodeType,
  itemType: NodeType,
  attrs?: Record<string, unknown>,
): boolean {
  const { $from, $to } = tr.selection
  const range = $from.blockRange($to)
  if (!range) return false

  const wrapping = findWrapping(range, listType, attrs)
  if (!wrapping) return false
  tr.wrap(range, wrapping)
  void itemType
  return true
}
