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

  /**
   * At the top of the block's first line, not the middle of it.
   *
   * Two wrong versions came first. Against the top of the whole *block* it sat
   * level with the cap height of whatever came first, so it read as aligned on
   * a paragraph and visibly high on a heading. Centred on the first line it
   * then drifted down as the line grew, which on a paragraph that wraps looks
   * like it belongs to the second line rather than the block.
   *
   * The first client rect is the first line box, and the grip goes at the top
   * of it — one optical nudge down, because a line box carries leading above
   * the letters and flush with its top reads high.
   */
  const place = (block: HTMLElement, ownerDocument: Document): void => {
    if (!handle) return
    const box = block.getBoundingClientRect()
    const firstLine = block.getClientRects()[0] ?? box
    const view = ownerDocument.defaultView
    handle.style.display = 'block'
    handle.style.left = `${box.left + (view?.scrollX ?? 0) - offset}px`
    handle.style.top = `${firstLine.top + (view?.scrollY ?? 0) + 2}px`
    /*
      Bridge the gap to the text.

      The grip is drawn `offset` pixels to the left of the block, which leaves
      dead space between the two that the pointer has to cross. Padding the
      handle out to the block's edge makes that space part of the target, so a
      straight line from the words to the grip never leaves it. It stops at the
      text and never covers it.
    */
    const grip = (handle.firstElementChild as HTMLElement | null) ?? handle
    const gripWidth = grip.getBoundingClientRect().width || handle.offsetWidth
    handle.style.paddingRight = `${Math.max(0, offset - gripWidth)}px`
  }

  return {
    kind: 'extension',
    name: 'dragHandle',

    onCreate(editor: Editor) {
      const view = (editor.unsafe.view ?? null) as { dom?: HTMLElement } | null
      const dom = view?.dom
      if (!dom) return
      root = dom
      // Built on the first move, not at mount: an editor mounted before its
      // element is in the page — Solid hands a ref an element cloned from a
      // template, which belongs to no page yet — has no body to put it in.
      // By the time a mouse moves over it, it is on screen.
      /*
        Declared before `ensure`, which registers them.

        `ensure()` runs immediately when the element is already in a page, so a
        `const` declared further down is still in its temporal dead zone when
        the listener is attached — the throw took `onCreate` with it and the
        handle never appeared at all.
      */
      let leaving = 0
      const hide = () => {
        if (handle) handle.style.display = 'none'
      }
      const cancelHide = () => {
        if (leaving) {
          clearTimeout(leaving)
          leaving = 0
        }
      }

      const ensure = (): HTMLElement => {
        if (handle) return handle
        handle = build(dom.ownerDocument)
        // Dragging the handle drags the block it points at: the mousedown
        // moves the selection into that block first, so the view's dragstart
        // finds it.
        handle.addEventListener('mouseenter', cancelHide)
        handle.addEventListener('mouseleave', () => {
          leaving = setTimeout(hide, 240) as unknown as number
        })
        handle.addEventListener('mousedown', () =>
          target?.scrollIntoView?.({ block: 'nearest' }),
        )
        handle.addEventListener('dragstart', (event) => {
          // Forward the drag to the editor, which owns the document logic.
          if (!target) return

          /*
            Drag the block, not the grip.

            The browser makes its drag image from whatever the drag started on,
            and the drag starts on the handle — so a nineteen-pixel grip flew
            around the screen while the paragraph it belonged to sat still. A
            clone of the block, laid out at the block's own width and lifted off
            the page, is what the pointer should be carrying.

            It has to be in the document and rendered when `setDragImage` is
            called, and can go the moment the browser has taken its snapshot.
          */
          const ghost = buildGhost(dom, target)
          const grab = event.clientX - target.getBoundingClientRect().left
          event.dataTransfer?.setDragImage(ghost, Math.max(0, grab), 16)
          window.setTimeout(() => ghost.remove(), 0)

          // The block it came from reads as lifted until the drag ends.
          target.classList.add('matra-dragging')
          const lifted = target
          const drop = () => {
            lifted.classList.remove('matra-dragging')
            handle?.removeEventListener('dragend', drop)
          }
          handle?.addEventListener('dragend', drop)
          const forwarded = new MouseEvent('dragstart', {
            clientY: targetTop(target),
            bubbles: true,
          })
          Object.defineProperty(forwarded, 'dataTransfer', { value: event.dataTransfer })
          dom.dispatchEvent(forwarded)
        })
        return handle
      }

      // In a page already: made now, so it is there before the first move.
      if (dom.ownerDocument.body) ensure()

      const onMove = (event: MouseEvent) => {
        const block = blockUnder(dom, event.clientY)
        if (!block) return
        // Still over the same block: the handle is already where it should
        // be, and measuring it again on every pixel of movement is what made
        // moving the mouse over a long document feel heavy.
        if (block === target && ensure().style.display === 'block') return
        target = block
        place(block, dom.ownerDocument)
      }
      /*
        Leaving the text is not leaving the handle.

        The handle lives outside the editable element, so a pointer travelling
        from the words towards it fires `mouseleave` on the way — and if that
        hides it, the grip vanishes just as you reach for it. Two things keep
        it there. `contains`, not `===`, because the grip is a child and the
        dots are children of that, so the old identity check failed the moment
        the default handle stopped being a single element. And a short grace
        period, because between the text and the grip is a gap of `offset`
        pixels belonging to neither, and the pointer is over nothing at all
        while it crosses.
      */
      const onLeave = (event: MouseEvent) => {
        const to = event.relatedTarget as Node | null
        if (to && handle?.contains(to)) return
        cancelHide()
        leaving = setTimeout(hide, 240) as unknown as number
      }

      dom.addEventListener('mousemove', onMove)
      dom.addEventListener('mouseleave', onLeave)
      cleanups.push(() => dom.removeEventListener('mousemove', onMove))
      cleanups.push(() => dom.removeEventListener('mouseleave', onLeave))
      cleanups.push(cancelHide)
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

/**
 * A copy of the block that still looks like the block.
 *
 * `setDragImage` needs an element that is in the document and rendered, and the
 * obvious place to put one is `document.body` — where it immediately stops
 * looking like itself. Everything a document's text inherits comes from either
 * the editor's own class or the page's rule for the element the editor is
 * mounted on, and a clone on the body is outside both: right words, wrong font,
 * wrong colour, wrong measure.
 *
 * So the clone goes inside a wrapper carrying the editor's class, with the
 * handful of inherited properties that come from the page copied across. It
 * never enters the real editor — a stray child inside a contenteditable is a
 * position the view would have to account for.
 */
const INHERITED = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'color',
] as const

/**
 * The colour the block actually sits on.
 *
 * Not the editor's own `background-color`, which is usually `transparent` — the
 * page paints behind it, and a ghost that copied that came out with no
 * background at all: text floating over whatever the drag passed across. The
 * first ancestor that paints something is the one the reader sees.
 */
function backgroundOf(element: HTMLElement): string {
  const view = element.ownerDocument.defaultView
  let node: HTMLElement | null = element
  while (node) {
    const colour = view?.getComputedStyle(node).backgroundColor ?? ''
    const invisible = colour === '' || colour === 'transparent' || /,\s*0\s*\)$/.test(colour)
    if (!invisible) return colour
    node = node.parentElement
  }
  return ''
}

function buildGhost(editor: HTMLElement, block: HTMLElement): HTMLElement {
  const ownerDocument = editor.ownerDocument
  const wrapper = ownerDocument.createElement('div')
  wrapper.className = `${editor.className} matra-drag-ghost`
  wrapper.setAttribute('aria-hidden', 'true')

  const view = ownerDocument.defaultView
  const from = view?.getComputedStyle(editor)
  if (from) {
    for (const property of INHERITED) {
      wrapper.style.setProperty(property, from.getPropertyValue(property))
    }
  }
  wrapper.style.width = `${block.getBoundingClientRect().width}px`
  wrapper.style.backgroundColor =
    backgroundOf(block) || `var(--matra-drag-ghost-bg, ${from?.backgroundColor || '#fff'})`

  const copy = block.cloneNode(true) as HTMLElement
  // The first block of a document has its top margin collapsed away; the clone
  // is the first block of this one, so it would gain one back.
  copy.style.margin = '0'
  wrapper.appendChild(copy)
  ownerDocument.body.appendChild(wrapper)
  return wrapper
}

function targetTop(block: HTMLElement): number {
  const box = block.getBoundingClientRect()
  return box.top + box.height / 2
}

function blockUnder(root: HTMLElement, y: number): HTMLElement | null {
  const index = blockIndexAt(root.children, y)
  return index === -1 ? null : (root.children[index] as HTMLElement)
}

/**
 * A six-dot grip, drawn rather than typed.
 *
 * `⠿` is a braille character, so its size and weight are whatever the reader's
 * font happens to do with it — at 14px it came out faint and small, and on a
 * machine without that glyph it comes out as a box. Six dots in a grid are the
 * same shape everywhere and can be sized to the hand rather than to a font.
 */
function defaultHandle(ownerDocument: Document): HTMLElement {
  // The grip is a child, not the handle itself: the handle carries an inline
  // `display` that the extension toggles, which would override the grid the
  // dots need — and a hover rule cannot reach a class on the element it is
  // already matching.
  const dom = ownerDocument.createElement('div')
  const grip = ownerDocument.createElement('div')
  grip.className = 'matra-drag-grip'
  for (let i = 0; i < 6; i++) grip.appendChild(ownerDocument.createElement('span'))
  dom.appendChild(grip)
  return dom
}

/** Enough styling to see the handle and the drop line. */
export const dragHandleCSS = `
@keyframes matra-drag-handle-in { from { opacity: 0 } }
.matra-drag-handle { z-index: 40; animation: matra-drag-handle-in 90ms ease; }
.matra-drag-handle:active { cursor: grabbing; }
.matra-drag-grip {
  display: grid;
  grid-template-columns: repeat(2, 2px);
  gap: 3px 3px;
  width: 14px;
  height: 18px;
  align-content: center;
  justify-content: center;
  opacity: 0.5;
  transition: opacity 90ms ease;
}
.matra-drag-grip > span {
  width: 2px;
  height: 2px;
  border-radius: 50%;
  background: var(--matra-drag-handle, currentColor);
}
.matra-drag-handle:hover .matra-drag-grip { opacity: 0.95; }
@media (prefers-reduced-motion: reduce) {
  .matra-drag-handle { animation: none }
  .matra-drag-grip { transition: none }
}
/*
  What is moving, and where it will land.

  The ghost is the block under the pointer; the source dims so the two read as
  one thing being carried out of a gap. A tall block is capped, because a drag
  image the height of the screen tells you nothing a hundred pixels would not.
*/
.matra-drag-ghost {
  position: fixed;
  top: -10000px;
  left: 0;
  max-height: 160px;
  overflow: hidden;
  pointer-events: none;
}
.matra-dragging { opacity: 0.4; transition: opacity 90ms ease; }
.matra-drop-cursor {
  color: var(--matra-drop-cursor, currentColor);
  border-radius: 1px;
}
@media (prefers-reduced-motion: reduce) {
  .matra-dragging { transition: none }
}
`
