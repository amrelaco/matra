import type { EditorState } from '../engine/state'
import type { EditorView } from '../engine/view'
import type { Editor, ExtensionDef } from '../types'

export interface BubbleMenuOptions {
  /** The element to show. Positioned absolutely by this extension, hidden when not needed. */
  element: HTMLElement
  /** When to show it. Default: the selection is not empty and the editor, or the menu, has focus. */
  shouldShow?: (editor: Editor) => boolean
  /** Above or below the selection. Default `top`. */
  placement?: 'top' | 'bottom'
  /** Pixels between the selection and the menu. Default 8. */
  offset?: number
}

export interface FloatingMenuOptions {
  element: HTMLElement
  /** When to show it. Default: the caret is in an empty top-level paragraph and the editor has focus. */
  shouldShow?: (editor: Editor) => boolean
  /** At the start of the line, or in the margin to its left. Default `start`. */
  placement?: 'start' | 'left'
  offset?: number
}

type Placement = 'top' | 'bottom' | 'start' | 'left'

const viewOf = (editor: Editor) => editor.unsafe.view as EditorView | null

/** The caret or selection's rectangle, if the browser selection is inside this editor. */
function selectionRect(editor: Editor): DOMRect | null {
  const view = viewOf(editor)
  if (!view || typeof window === 'undefined') return null
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!view.dom.contains(range.commonAncestorContainer)) return null
  const rect = range.getBoundingClientRect()
  if (rect.width || rect.height) return rect
  // A collapsed range in an empty block has no box of its own; the block has one.
  const container = range.startContainer
  const element =
    container.nodeType === 1 ? (container as Element) : (container.parentElement ?? null)
  return element ? element.getBoundingClientRect() : null
}

/** Put `element` beside `rect`, in the coordinates of whatever it is positioned against. */
function place(
  element: HTMLElement,
  rect: DOMRect,
  placement: Placement,
  offset: number,
): void {
  const parent = element.offsetParent as HTMLElement | null
  const anchored = parent && parent !== document.body ? parent : null
  const base = anchored ? anchored.getBoundingClientRect() : null
  let left =
    rect.left - (base ? base.left : 0) + (anchored ? anchored.scrollLeft : window.scrollX)
  let top = rect.top - (base ? base.top : 0) + (anchored ? anchored.scrollTop : window.scrollY)

  if (placement === 'top' || placement === 'bottom') {
    left += rect.width / 2 - element.offsetWidth / 2
    top += placement === 'top' ? -(element.offsetHeight + offset) : rect.height + offset
  } else if (placement === 'left') {
    left -= element.offsetWidth + offset
    top += (rect.height - element.offsetHeight) / 2
  } else {
    left += offset
    top += (rect.height - element.offsetHeight) / 2
  }
  element.style.left = `${Math.max(0, Math.round(left))}px`
  element.style.top = `${Math.max(0, Math.round(top))}px`
}

/**
 * Keep an element positioned against the editor while it is mounted.
 *
 * The same wiring for both menus: re-check after every change, caret move,
 * focus change and resize, coalesced to one frame, and tear it all down with
 * the editor.
 */
function attach(
  editor: Editor,
  element: HTMLElement,
  show: () => DOMRect | null,
  placement: Placement,
  offset: number,
): () => void {
  if (typeof window === 'undefined') return () => undefined
  const position = getComputedStyle(element).position
  if (!position || position === 'static') element.style.position = 'absolute'
  element.hidden = true

  let pending = false
  let frame: number | null = null
  const update = () => {
    pending = false
    frame = null
    const rect = show()
    if (!rect) {
      element.hidden = true
      return
    }
    element.hidden = false
    place(element, rect, placement, offset)
  }
  const schedule = () => {
    if (pending) return
    pending = true
    const raf = window.requestAnimationFrame
    const handle = raf ? raf(update) : window.setTimeout(update, 0)
    // Still pending: a frame that ran synchronously has already cleared it.
    if (pending) frame = handle
  }

  const offs = [
    editor.on('change', schedule),
    editor.on('selectionChange', schedule),
    editor.on('focus', schedule),
    editor.on('blur', schedule),
  ]
  window.addEventListener('resize', schedule)
  schedule()

  return () => {
    for (const off of offs) off()
    window.removeEventListener('resize', schedule)
    if (frame !== null) {
      const cancel = window.cancelAnimationFrame
      if (cancel) cancel(frame)
      else window.clearTimeout(frame)
    }
    element.hidden = true
  }
}

/**
 * A menu that appears over the selection.
 *
 * You bring the element; this shows it when something is selected, places it
 * above the selection, and hides it when the selection collapses or focus
 * leaves both the editor and the menu. Buttons inside it should prevent the
 * default on `mousedown`, so pressing one does not take the selection away
 * from the text it is about to format.
 */
export function bubbleMenu(options: BubbleMenuOptions): ExtensionDef {
  const detach = new WeakMap<Editor, () => void>()
  const shouldShow =
    options.shouldShow ??
    ((editor: Editor) => {
      if (editor.selection.empty) return false
      const view = viewOf(editor)
      return Boolean(view?.hasFocus) || options.element.contains(document.activeElement)
    })
  return {
    kind: 'extension',
    name: 'bubbleMenu',
    onCreate: (editor) => {
      detach.set(
        editor,
        attach(
          editor,
          options.element,
          () => (shouldShow(editor) ? selectionRect(editor) : null),
          options.placement ?? 'top',
          options.offset ?? 8,
        ),
      )
    },
    onDestroy: (editor) => {
      detach.get(editor)?.()
      detach.delete(editor)
    },
  }
}

/**
 * A menu that appears on an empty line.
 *
 * The "what goes here" affordance: a plus in the margin, or a row of block
 * types beside the caret. Shown when the caret sits in an empty top-level
 * paragraph in a focused editor, and nowhere else.
 */
export function floatingMenu(options: FloatingMenuOptions): ExtensionDef {
  const detach = new WeakMap<Editor, () => void>()
  const shouldShow =
    options.shouldShow ??
    ((editor: Editor) => {
      if (!editor.selection.empty || !viewOf(editor)?.hasFocus) return false
      const $from = (editor.unsafe.state as EditorState).selection.$from
      return $from.depth === 1 && $from.parent.isTextblock && $from.parent.content.size === 0
    })
  return {
    kind: 'extension',
    name: 'floatingMenu',
    onCreate: (editor) => {
      detach.set(
        editor,
        attach(
          editor,
          options.element,
          () => (shouldShow(editor) ? selectionRect(editor) : null),
          options.placement ?? 'start',
          options.offset ?? 8,
        ),
      )
    },
    onDestroy: (editor) => {
      detach.get(editor)?.()
      detach.delete(editor)
    },
  }
}
