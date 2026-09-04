import { blockIndexAt } from '../engine/view/drag'
import type { Editor, ExtensionDef } from '../types'

export interface DragHandleOptions {
  /** Build your own handle. Default is a six-dot grip. */
  render?: () => HTMLElement
  /** Distance from the block's left edge, in pixels. */
  offset?: number
}

/**
 * A grip that appears beside the block under the pointer, and drags it.
 *
 * One element, moved, rather than a widget decoration per block. A decoration
 * per block would put a handle in the document's decoration set for every
 * paragraph — thousands on a long document, all recomputed whenever anything
 * changes — to show one at a time.
 *
 * The handle sits outside the editable element and is `contenteditable="false"`
 * regardless, so it can never take the caret or become part of the document.
 */
export function dragHandle(options: DragHandleOptions = {}): ExtensionDef {
  const offset = options.offset ?? 28
  let handle: HTMLElement | null = null
  let root: HTMLElement | null = null
  let target: HTMLElement | null = null
  const cleanups: (() => void)[] = []

  const build = (ownerDocument: Document): HTMLElement => {
    const dom = options.render?.() ?? defaultHandle(ownerDocument)
    dom.setAttribute('contenteditable', 'false')
    dom.setAttribute('draggable', 'true')
    dom.setAttribute('aria-label', 'Drag to move this block')
    dom.classList.add('matra-drag-handle')
    dom.style.position = 'absolute'
    dom.style.display = 'none'
    dom.style.cursor = 'grab'
    dom.style.userSelect = 'none'
    ownerDocument.body.appendChild(dom)
    return dom
  }

  const place = (block: HTMLElement, ownerDocument: Document): void => {
    if (!handle) return
    const box = block.getBoundingClientRect()
    const view = ownerDocument.defaultView
    handle.style.left = `${box.left + (view?.scrollX ?? 0) - offset}px`
    handle.style.top = `${box.top + (view?.scrollY ?? 0)}px`
    handle.style.display = 'block'
  }

  return {
    kind: 'extension',
    name: 'dragHandle',

    onCreate(editor: Editor) {
      const view = (editor.unsafe.view ?? null) as { dom?: HTMLElement } | null
      const dom = view?.dom
      if (!dom) return
      root = dom
      const ownerDocument = dom.ownerDocument
      handle = build(ownerDocument)

      const onMove = (event: MouseEvent) => {
        const block = blockUnder(dom, event.clientY)
        if (!block) return
        // Still over the same block: the handle is already where it should
        // be, and measuring it again on every pixel of movement is what made
        // moving the mouse over a long document feel heavy.
        if (block === target && handle?.style.display === 'block') return
        target = block
        place(block, ownerDocument)
      }
      const onLeave = (event: MouseEvent) => {
        // Moving onto the handle itself is not leaving.
        if (event.relatedTarget === handle) return
        if (handle) handle.style.display = 'none'
      }
      // Dragging the handle drags the block it points at: the mousedown moves
      // the selection into that block first, so the view's dragstart finds it.
      const onHandleDown = () => target?.scrollIntoView?.({ block: 'nearest' })

      dom.addEventListener('mousemove', onMove)
      dom.addEventListener('mouseleave', onLeave)
      handle.addEventListener('mousedown', onHandleDown)
      handle.addEventListener('dragstart', (event) => {
        // Forward the drag to the editor, which owns the document logic.
        if (!target) return
        const forwarded = new MouseEvent('dragstart', {
          clientY: targetTop(target),
          bubbles: true,
        })
        Object.defineProperty(forwarded, 'dataTransfer', { value: event.dataTransfer })
        dom.dispatchEvent(forwarded)
      })

      cleanups.push(() => dom.removeEventListener('mousemove', onMove))
      cleanups.push(() => dom.removeEventListener('mouseleave', onLeave))
    },

    onDestroy() {
      for (const off of cleanups) off()
      cleanups.length = 0
      handle?.remove()
      handle = null
      root = null
      target = null
    },
  }
}

function targetTop(block: HTMLElement): number {
  const box = block.getBoundingClientRect()
  return box.top + box.height / 2
}

function blockUnder(root: HTMLElement, y: number): HTMLElement | null {
  const index = blockIndexAt(root.children, y)
  return index === -1 ? null : (root.children[index] as HTMLElement)
}

function defaultHandle(ownerDocument: Document): HTMLElement {
  const dom = ownerDocument.createElement('div')
  dom.innerHTML = ''
  dom.textContent = '⠿'
  dom.style.cssText =
    'width:18px;height:22px;display:flex;align-items:center;justify-content:center;opacity:0.4;font-size:14px;line-height:1'
  return dom
}

/** Enough styling to see the handle and the drop line. */
export const dragHandleCSS = `
.matra-drag-handle { transition: opacity 120ms ease; z-index: 40; }
.matra-drag-handle:hover { opacity: 0.9; }
.matra-drag-handle:active { cursor: grabbing; }
.matra-drop-cursor { color: currentColor; }
`
