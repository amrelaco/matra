import type { Node } from '../model/node'
import { type Selection, TextSelection } from '../state/selection'
import type { DOMMap } from './dom-map'

/**
 * Keeping the browser's caret and the model's selection in step.
 *
 * The DOM is authoritative for what the user did; the model is authoritative
 * for what the document is. These two functions are the only places the two
 * are allowed to disagree.
 */

/** Read the browser selection as a model selection. */
export function readSelection(root: HTMLElement, map: DOMMap, doc: Node): Selection | null {
  const domSelection = root.ownerDocument.getSelection()
  if (!domSelection || domSelection.rangeCount === 0) return null
  const { anchorNode, anchorOffset, focusOffset } = domSelection
  if (!anchorNode || !root.contains(anchorNode)) return null
  const focusNode = domSelection.focusNode ?? anchorNode

  // A DOM that reports the focus wrongly — happy-dom hands back the anchor
  // offset for it — shows a range with an extent and a focus that says it
  // has none. The range is right when the focus is not, so it is read from
  // there, with the direction taken from the anchor. Only that case pays
  // for it: a caret, which is every keystroke, never touches the range.
  if (!domSelection.isCollapsed && anchorNode === focusNode && anchorOffset === focusOffset) {
    const range = domSelection.getRangeAt(0)
    if (!range.collapsed) {
      const backwards = anchorNode === range.endContainer && anchorOffset === range.endOffset
      const start = map.posFromDOM(root, range.startContainer, range.startOffset)
      const end = map.posFromDOM(root, range.endContainer, range.endOffset)
      if (start === null || end === null) return null
      return backwards
        ? TextSelection.create(doc, end, start)
        : TextSelection.create(doc, start, end)
    }
  }

  const anchor = map.posFromDOM(root, anchorNode, anchorOffset)
  const head = map.posFromDOM(root, focusNode, focusOffset)
  if (anchor === null || head === null) return null

  return TextSelection.create(doc, anchor, head)
}

/** Does `head` come before `anchor` in the document? */
function isBackwards(
  anchor: { node: globalThis.Node; offset: number },
  head: { node: globalThis.Node; offset: number },
): boolean {
  if (anchor.node === head.node) return head.offset < anchor.offset
  // Bit 2: the other node precedes this one.
  return (anchor.node.compareDocumentPosition(head.node) & 2) !== 0
}

/** Put the browser caret where the model says it is. */
export function writeSelection(
  root: HTMLElement,
  map: DOMMap,
  doc: Node,
  selection: Selection,
): void {
  const domSelection = root.ownerDocument.getSelection()
  if (!domSelection) return

  const anchor = map.domFromPos(doc, selection.anchor)
  const head = map.domFromPos(doc, selection.head)
  if (!anchor || !head) return

  // Already there: leave it. Writing a selection the browser already holds
  // still costs a selection change — a repaint, and a `selectionchange` event
  // that comes straight back here to be read and found identical. Every
  // keystroke and every click used to pay for that round trip.
  if (
    domSelection.anchorNode === anchor.node &&
    domSelection.anchorOffset === anchor.offset &&
    domSelection.focusNode === head.node &&
    domSelection.focusOffset === head.offset
  ) {
    return
  }

  try {
    // A selection dragged leftwards is anchored on its right, and a range
    // cannot say so; base and extent can, so that one is written that way
    // and Shift-Arrow keeps extending the end the user is moving. Forwards
    // and collapsed selections — every keystroke — take the range, which is
    // the cheaper call in the DOMs this runs in.
    if (isBackwards(anchor, head) && typeof domSelection.setBaseAndExtent === 'function') {
      domSelection.setBaseAndExtent(anchor.node, anchor.offset, head.node, head.offset)
      return
    }
    const range = root.ownerDocument.createRange()
    range.setStart(anchor.node, anchor.offset)
    range.setEnd(head.node, head.offset)
    domSelection.removeAllRanges()
    domSelection.addRange(range)
  } catch {
    // A stale offset is not worth throwing over; leave the caret alone.
  }
}
