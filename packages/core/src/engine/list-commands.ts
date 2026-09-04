import { Fragment } from './model/fragment'
import type { Node } from './model/node'
import type { NodeRange, ResolvedPos } from './model/resolved-pos'
import type { NodeType } from './model/schema'
import type { EditorState } from './state/state'
import type { Transaction } from './state/transaction'
import { accepts, liftTarget } from './transform/structure'

/**
 * List editing — the Matra engine's own.
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
    return escapeList(tr, $from, itemDepth)
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
 * an editor stops feeling like one. The item's blocks come out as they are, so
 * Backspace at the start of a bullet is an outdent, not a delete.
 */
export function escapeList(tr: Transaction, $from: ResolvedPos, itemDepth: number): boolean {
  const index = $from.index(itemDepth - 1)
  return unwrapItems(tr, $from, itemDepth - 1, index, index)
}

/** A node whose children are items. */
function isList(type: NodeType): boolean {
  return type.contentMatch.allowed.some((child) => (child as NodeType).spec.listItem === true)
}

/**
 * Take items out of a top-level list, as the blocks they hold.
 *
 * The list is split around them: items before stay in a list, items after
 * stay in one, and the blocks of the items between stand where the list was.
 * Every block keeps its place, so a caret in a word is still in that word.
 */
export function unwrapItems(
  tr: Transaction,
  $from: ResolvedPos,
  listDepth: number,
  first: number,
  last: number,
): boolean {
  const list = $from.node(listDepth)
  const listStart = $from.before(listDepth)
  const listEnd = listStart + list.nodeSize
  const before = list.content.cut(0, list.content.offsetAt(first))
  const after = list.content.cut(list.content.offsetAt(last + 1))

  const out: Node[] = []
  const kept: number[] = []
  let newPos = listStart
  if (before.childCount > 0) {
    const head = list.copy(before)
    out.push(head)
    kept.push(listStart + 1, listStart + 1 + before.size, listStart + 1)
    newPos += head.nodeSize
  }
  for (let i = first; i <= last; i++) {
    const item = list.child(i)
    const itemStart = listStart + 1 + list.content.offsetAt(i)
    for (const block of item.content.content) out.push(block)
    kept.push(itemStart + 1, itemStart + item.nodeSize - 1, newPos)
    newPos += item.content.size
  }
  if (after.childCount > 0) {
    out.push(list.copy(after))
    kept.push(listStart + 1 + list.content.offsetAt(last + 1), listEnd - 1, newPos + 1)
  }

  // The parent has to accept blocks where the list stood.
  if (
    !accepts($from.node(listDepth - 1), $from.start(listDepth - 1), listStart, listEnd, out)
  ) {
    return false
  }
  tr.rebuild(listStart, listEnd, out, kept)
  return true
}

/**
 * Put every block in the range into an item of its own, in one new list.
 *
 * One item per block: two selected paragraphs become two bullets, which is
 * what the button means. Wrapping the run as a whole made one bullet with two
 * paragraphs in it.
 */
function wrapInList(
  tr: Transaction,
  range: NodeRange,
  listType: NodeType,
  itemType: NodeType,
): boolean {
  const items: Node[] = []
  const kept: number[] = []
  let oldPos = range.start
  let newPos = range.start + 1
  for (let i = range.startIndex; i < range.endIndex; i++) {
    const block = range.parent.child(i)
    if (!itemType.validContent(Fragment.from(block))) return false
    items.push(itemType.create(null, block))
    kept.push(oldPos, oldPos + block.nodeSize, newPos + 1)
    oldPos += block.nodeSize
    newPos += block.nodeSize + 2
  }
  const list = listType.create(null, items)
  const { parent, start, end } = range
  if (!accepts(parent, range.$from.start(range.depth), start, end, [list])) return false
  tr.rebuild(start, end, list, kept)
  return true
}

/** Make a list of one kind a list of another, item by item, in place. */
function retypeList(
  tr: Transaction,
  $from: ResolvedPos,
  listDepth: number,
  listType: NodeType,
  itemType: NodeType,
): boolean {
  const list = $from.node(listDepth)
  const items: Node[] = []
  for (const item of list.content.content) {
    if (!itemType.validContent(item.content)) return false
    items.push(item.type === itemType ? item : itemType.create(null, item.content))
  }
  const listStart = $from.before(listDepth)
  const listEnd = listStart + list.nodeSize
  const retyped = listType.create(null, items)
  if (
    !accepts($from.node(listDepth - 1), $from.start(listDepth - 1), listStart, listEnd, [
      retyped,
    ])
  ) {
    return false
  }
  // Same tokens in the same places, of another kind: nothing moves.
  tr.rebuild(listStart, listEnd, retyped, [listStart + 1, listEnd - 1, listStart + 1])
  return true
}

/**
 * The list button.
 *
 * Outside a list, the blocks in the selection become a list, one item each.
 * In a list of this kind, the selected items leave it — one level out when
 * the list is nested, as Shift-Tab goes, and out to plain blocks at the top.
 * In a list of another kind, the list changes kind where it stands.
 */
export function toggleList(tr: Transaction, listType: NodeType, itemType: NodeType): boolean {
  const { $from, $to } = tr.selection
  const range = $from.blockRange($to)
  if (!range) return false
  let listDepth = -1
  for (let depth = range.depth; depth > 0; depth--) {
    if (isList($from.node(depth).type)) {
      listDepth = depth
      break
    }
  }
  if (listDepth === -1) return wrapInList(tr, range, listType, itemType)
  const list = $from.node(listDepth)
  if (list.type !== listType) return retypeList(tr, $from, listDepth, listType, itemType)
  if (listDepth > 1 && $from.node(listDepth - 1).type.spec.listItem) {
    return outdent(tr, $from, listDepth + 1)
  }
  const first = $from.index(listDepth)
  const last =
    $to.depth >= listDepth && $to.node(listDepth) === list
      ? $to.index(listDepth)
      : list.childCount - 1
  return unwrapItems(tr, $from, listDepth, first, last)
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
  // A top-level item has no list to lift into, so it leaves the list: the
  // bullet becomes a paragraph, which is what Shift-Tab means there.
  if (target === null) return itemDepth > 0 && escapeList(tr, $from, itemDepth)
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
  const keptList =
    before.childCount > 0 ? Fragment.from([innerList.copy(before)]) : Fragment.empty
  const newOuter = outerItem.copy(head.append(keptList).append(tail))

  // What stays where it can be followed: the outer item's own blocks, the
  // items before this one, this item's content, and the items after it,
  // which now sit inside it. A tail after the inner list ends up before the
  // item in the new order, so it cannot be followed and is not listed.
  const itemStart = $from.before(itemDepth)
  const itemEnd = itemStart + item.nodeSize
  const carriedStart = outerStart + newOuter.nodeSize
  const kept = [outerStart + 1, innerStart, outerStart + 1]
  if (before.childCount > 0) kept.push(innerStart + 1, itemStart, innerStart + 1)
  kept.push(itemStart + 1, itemEnd - 1, carriedStart + 1)
  if (after.childCount > 0) {
    kept.push(itemEnd, innerStart + innerList.nodeSize - 1, carriedStart + item.nodeSize)
  }
  tr.rebuild(outerStart, outerStart + outerItem.nodeSize, [newOuter, carried], kept)
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
  const previousStart = listStart + list.content.offsetAt(index - 1)
  const itemStart = listStart + list.content.offsetAt(index)
  const itemEnd = itemStart + item.nodeSize

  // The previous item's content and this item stay put: the previous item's
  // closing token becomes the nested list's opening one, same width.
  tr.rebuild(previousStart, itemEnd, merged, [
    previousStart + 1,
    itemStart - 1,
    previousStart + 1,
    itemStart,
    itemEnd,
    itemStart,
  ])
  return true
}
