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
  if (!domSelection.anchorNode || !root.contains(domSelection.anchorNode)) return null

  const anchor = map.posFromDOM(root, domSelection.anchorNode, domSelection.anchorOffset)
  const head = map.posFromDOM(
    root,
    domSelection.focusNode ?? domSelection.anchorNode,
    domSelection.focusOffset,
  )
  if (anchor === null || head === null) return null

  return TextSelection.create(doc, anchor, head)
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

  const range = root.ownerDocument.createRange()
  try {
    range.setStart(anchor.node, anchor.offset)
    range.setEnd(head.node, head.offset)
  } catch {
    // A stale offset is not worth throwing over; leave the caret alone.
    return
  }
  domSelection.removeAllRanges()
  domSelection.addRange(range)
}
