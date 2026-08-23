import { Fragment } from './model/fragment'
import type { Node } from './model/node'
import type { NodeType } from './model/schema'
import type { EditorState } from './state/state'
import type { Transaction } from './state/transaction'
import { liftTarget } from './transform/structure'

/**
 * List editing — ours.
 *
 * These work on the transaction the command is already building, so a list
 * change lands in the same undo step as whatever prompted it.
 */

/** Split the list item at the cursor, the way Enter should behave. */
export function splitListItem(
  state: EditorState,
  tr: Transaction,
  itemType: NodeType,
): boolean {
  const { $from } = tr.selection
  if (!tr.selection.empty) return false

  // Find the item this cursor sits in.
  let itemDepth = -1
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === itemType) {
      itemDepth = depth
      break
    }
  }
  if (itemDepth === -1) return false

  const item = $from.node(itemDepth)
  const block = $from.parent
  if (!block.isTextblock) return false

  // An empty item means the writer is finished with the list.
  if (block.content.size === 0 && item.childCount === 1) {
    return liftListItem(state, tr, itemType)
  }

  const head = block.copy(block.content.cut(0, $from.parentOffset))
  const tail = block.copy(block.content.cut($from.parentOffset))
  const newItem = item.type.createAndFill(item.attrs, Fragment.from([tail]))
  if (!newItem) return false

  const itemStart = $from.start(itemDepth) - 1
  const itemEnd = $from.end(itemDepth) + 1
  const firstItem = item.copy(Fragment.from([head]))
  tr.replaceWith(itemStart, itemEnd, Fragment.from([firstItem, newItem]))
  tr.selectAt(itemStart + firstItem.nodeSize + 2)
  return true
}

/** Pull the item out one level, or out of the list entirely. */
export function liftListItem(state: EditorState, tr: Transaction, itemType: NodeType): boolean {
  const { $from, $to } = tr.selection
  const range = $from.blockRange($to, (node) => node.firstChild?.type === itemType)
  if (!range) return false
  const target = liftTarget(range)
  if (target === null) return false
  tr.lift(range, target)
  return true
}

/** Push the item one level deeper, nesting it under its previous sibling. */
export function sinkListItem(state: EditorState, tr: Transaction, itemType: NodeType): boolean {
  const { $from } = tr.selection

  let itemDepth = -1
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === itemType) {
      itemDepth = depth
      break
    }
  }
  if (itemDepth < 1) return false

  const list = $from.node(itemDepth - 1)
  const item = $from.node(itemDepth)
  const index = $from.index(itemDepth - 1)
  // Nothing to nest under: the item is already first in its list.
  if (index === 0) return false

  const previous = list.child(index - 1) as Node
  const nested = list.type.createAndFill(list.attrs, Fragment.from([item]))
  if (!nested) return false

  const merged = previous.copy(previous.content.append(Fragment.from([nested])))
  const listStart = $from.start(itemDepth - 1)
  const previousStart = listStart + offsetOfChild(list, index - 1)
  const itemEnd = listStart + offsetOfChild(list, index) + item.nodeSize

  tr.replaceWith(previousStart, itemEnd, Fragment.from([merged]))
  return true
}

function offsetOfChild(parent: Node, index: number): number {
  let offset = 0
  for (let i = 0; i < index; i++) offset += parent.child(i).nodeSize
  return offset
}
