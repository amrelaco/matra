import { Fragment } from './model/fragment'
import type { Node } from './model/node'
import type { ResolvedPos } from './model/resolved-pos'
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

/**
 * The item type the caret is inside, whatever it is called.
 *
 * A checklist item and a bullet item are the same shape and want the same
 * keys, and hard-coding `listItem` here is why ticking Enter inside a checkbox
 * produced a second paragraph in the same item instead of a second checkbox.
 * Any node that declares `listItem: true` gets the behaviour.
 */
export function itemTypeAt($from: ResolvedPos, fallback?: NodeType): NodeType | null {
  for (let depth = $from.depth; depth > 0; depth--) {
    const type = $from.node(depth).type
    if (type.spec.listItem) return type
  }
  return fallback ?? null
}

/** Split the list item at the cursor, the way Enter should behave. */
export function splitListItem(
  state: EditorState,
  tr: Transaction,
  preferred: NodeType,
): boolean {
  const { $from } = tr.selection
  if (!tr.selection.empty) return false

  const itemType = itemTypeAt($from, preferred)
  if (!itemType) return false

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
    if (liftListItem(state, tr, itemType)) return true
    return escapeList(state, tr, $from, itemDepth)
  }

  const head = block.copy(block.content.cut(0, $from.parentOffset))
  const tail = block.copy(block.content.cut($from.parentOffset))
  // A new checklist item starts unticked. Carrying `checked` across means
  // pressing Enter under a done item silently marks the next one done too.
  const carried =
    item.attrs?.checked === undefined ? item.attrs : { ...item.attrs, checked: false }
  const newItem = item.type.createAndFill(carried, Fragment.from([tail]))
  if (!newItem) return false

  const itemStart = $from.start(itemDepth) - 1
  const itemEnd = $from.end(itemDepth) + 1
  const firstItem = item.copy(Fragment.from([head]))
  tr.replaceWith(itemStart, itemEnd, Fragment.from([firstItem, newItem]))
  tr.selectAt(itemStart + firstItem.nodeSize + 2)
  return true
}

/**
 * Leave a list that has nowhere left to lift to.
 *
 * `liftListItem` refuses a top-level list, because there is no ancestor to lift
 * into. Without this the last bullet of a top-level list swallows both Enter and
 * Backspace, and the only way out of the list is the mouse — which is the moment
 * an editor stops feeling like one.
 *
 * The list is split around the item so that leaving from the middle keeps the
 * items after it in order, and the item's own content comes with it: Backspace
 * at the start of a bullet is an outdent, not a delete.
 */
export function escapeList(
  state: EditorState,
  tr: Transaction,
  $from: ResolvedPos,
  itemDepth: number,
): boolean {
  const paragraphType = state.schema.nodes.paragraph
  if (!paragraphType) return false

  const listDepth = itemDepth - 1
  const list = $from.node(listDepth)
  const item = $from.node(itemDepth)
  // One block only. Pulling the first block out of an item that also holds a
  // nested list would leave the rest of the item behind with no item to be in.
  if (item.childCount !== 1) return false

  const listStart = $from.before(listDepth)
  const offset = $from.before(itemDepth) - (listStart + 1)

  const before = list.content.cut(0, offset)
  const after = list.content.cut(offset + item.nodeSize)
  const paragraph = paragraphType.createAndFill(null, item.child(0).content)
  if (!paragraph) return false

  const out: Node[] = []
  const head = before.childCount > 0 ? list.copy(before) : null
  if (head) out.push(head)
  out.push(paragraph)
  if (after.childCount > 0) out.push(list.copy(after))

  tr.replaceWith(listStart, listStart + list.nodeSize, Fragment.from(out))
  tr.selectAt(listStart + (head ? head.nodeSize : 0) + 1)
  return true
}

/** Pull the item out one level, or out of the list entirely. */
export function liftListItem(
  state: EditorState,
  tr: Transaction,
  preferred: NodeType,
): boolean {
  const { $from, $to } = tr.selection
  const itemType = itemTypeAt($from, preferred)
  if (!itemType) return false

  // Nested first. `lift` moves a range up one parent, which for an item inside
  // an inner list means lifting it into the *item* that holds that list — not
  // out to the list beside it. `liftTarget` correctly refuses, so Shift-Tab did
  // nothing at all and Tab was a one-way door.
  let itemDepth = -1
  for (let depth = $from.depth; depth > 0; depth--) {
    if ($from.node(depth).type === itemType) {
      itemDepth = depth
      break
    }
  }
  if (itemDepth > 2 && $from.node(itemDepth - 2).type.spec.listItem) {
    return outdent(tr, $from, itemDepth)
  }

  const range = $from.blockRange($to, (node) => node.firstChild?.type === itemType)
  if (!range) return false
  const target = liftTarget(range)
  if (target === null) return false
  tr.lift(range, target)
  return true
}

/**
 * Move a nested item out one level, into the list its parent item belongs to.
 *
 * Items below it in the inner list come with it as its own children, which is
 * what every outliner does: outdenting a heading takes its section along rather
 * than orphaning it in a list the reader can no longer see.
 */
function outdent(tr: Transaction, $from: ResolvedPos, itemDepth: number): boolean {
  const innerListDepth = itemDepth - 1
  const outerItemDepth = itemDepth - 2

  const item = $from.node(itemDepth)
  const innerList = $from.node(innerListDepth)
  const outerItem = $from.node(outerItemDepth)

  const innerStart = $from.before(innerListDepth)
  const outerStart = $from.before(outerItemDepth)

  const itemOffset = $from.before(itemDepth) - (innerStart + 1)
  const before = innerList.content.cut(0, itemOffset)
  const after = innerList.content.cut(itemOffset + item.nodeSize)

  const carried =
    after.childCount > 0
      ? item.copy(item.content.append(Fragment.from([innerList.copy(after)])))
      : item

  const innerOffset = innerStart - (outerStart + 1)
  const head = outerItem.content.cut(0, innerOffset)
  const tail = outerItem.content.cut(innerOffset + innerList.nodeSize)
  const kept = before.childCount > 0 ? Fragment.from([innerList.copy(before)]) : Fragment.empty
  const newOuter = outerItem.copy(head.append(kept).append(tail))

  tr.replaceWith(
    outerStart,
    outerStart + outerItem.nodeSize,
    Fragment.from([newOuter, carried]),
  )
  // Same offset in the same paragraph, one level to the left.
  tr.selectAt(outerStart + newOuter.nodeSize + 2 + $from.parentOffset)
  return true
}

/** Push the item one level deeper, nesting it under its previous sibling. */
export function sinkListItem(
  state: EditorState,
  tr: Transaction,
  preferred: NodeType,
): boolean {
  const { $from } = tr.selection
  const itemType = itemTypeAt($from, preferred)
  if (!itemType) return false

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
