import type { Node } from '../model/node'

/**
 * Where a drop would land, and where to draw the line saying so.
 *
 * Dropping is a question about coordinates, and the DOM is the only thing that
 * knows where anything is on screen. So the geometry is read from it, and only
 * the answer — a document position — crosses back into the model.
 */
export interface DropTarget {
  /** The document position the dragged content would be inserted at. */
  pos: number
  /** Screen rectangle of the line to draw, relative to the viewport. */
  rect: { left: number; top: number; width: number }
}

/**
 * The block-level position nearest a point.
 *
 * Native `caretPositionFromPoint` answers a question about text, which is the
 * wrong question when dragging a whole paragraph: dropping a block in the
 * middle of a word should put it between blocks, not split the word. So the
 * top-level children are measured instead, and the answer is always a boundary
 * between blocks.
 */
export function blockDropTarget(root: HTMLElement, doc: Node, y: number): DropTarget | null {
  const children = Array.from(root.children) as HTMLElement[]
  if (children.length === 0) return null

  let best: DropTarget | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  doc.content.forEach((child, offset, index) => {
    const dom = children[index]
    if (!dom) return
    const box = dom.getBoundingClientRect()
    // Before or after this block, whichever edge the pointer is nearer.
    const after = y > box.top + box.height / 2
    const edge = after ? box.bottom : box.top
    const distance = Math.abs(y - edge)
    if (distance < bestDistance) {
      bestDistance = distance
      best = {
        pos: after ? offset + child.nodeSize : offset,
        rect: { left: box.left, top: edge, width: box.width },
      }
    }
  })
  return best
}

/**
 * The line drawn where a drop would land.
 *
 * Kept out of the document deliberately. Dragover fires continuously, and
 * redrawing the document on every one of those events would make a drag stutter
 * — so this is a plain element positioned over the page, not a decoration.
 */
export class DropCursor {
  private element: HTMLElement | null = null

  constructor(private readonly ownerDocument: Document) {}

  show(rect: DropTarget['rect']): void {
    const dom = this.element ?? this.build()
    // The rect is viewport-relative and the cursor is page-positioned, so the
    // scroll offset is the difference between the two.
    const view = this.ownerDocument.defaultView
    dom.style.left = `${rect.left + (view?.scrollX ?? 0)}px`
    dom.style.top = `${rect.top + (view?.scrollY ?? 0)}px`
    dom.style.width = `${rect.width}px`
    dom.style.display = 'block'
  }

  hide(): void {
    if (this.element) this.element.style.display = 'none'
  }

  destroy(): void {
    this.element?.remove()
    this.element = null
  }

  private build(): HTMLElement {
    const dom = this.ownerDocument.createElement('div')
    dom.className = 'matra-drop-cursor'
    dom.setAttribute('aria-hidden', 'true')
    dom.style.cssText =
      'position:absolute;height:2px;background:currentColor;pointer-events:none;z-index:50;display:none'
    this.ownerDocument.body.appendChild(dom)
    this.element = dom
    return dom
  }
}
