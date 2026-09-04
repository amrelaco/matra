import { engine } from '../internal'
import type { Command, Editor, ExtensionDef } from '../types'

export interface TypewriterOptions {
  /**
   * Where the caret's line is kept, as a fraction of the visible height:
   * 0 is the top, 1 the bottom. Default 0.5.
   */
  position?: number
  /** Glide there rather than jump. Default false. */
  smooth?: boolean
  /**
   * The element that scrolls, or a function that finds it. Default the page.
   */
  scroller?: HTMLElement | (() => HTMLElement | null)
}

export interface TypewriterState {
  enabled: boolean
}

const SET = 'typewriter:set'
const ENABLED: TypewriterState = { enabled: true }
const DISABLED: TypewriterState = { enabled: false }

interface Session {
  /** A frame is already booked for this editor. */
  pending: boolean
  cleanups: Array<() => void>
}

interface Scrollable {
  scrollBy(options: { top: number; behavior: ScrollBehavior }): void
}

/**
 * The line being written stays put; the page moves under it.
 *
 * What a typewriter did, and what a long writing session wants: the eye
 * never travels down the screen to find the caret, because the caret never
 * leaves the spot. After each edit or caret move the caret's line is scrolled
 * to `position` of the scroller's visible height — the middle, unless asked
 * otherwise.
 *
 * The caret is measured in the next animation frame rather than as the
 * change lands: the DOM was patched a moment ago and measuring it then would
 * force a layout in the middle of the input path, where the browser was
 * about to lay it out anyway. One frame per burst, however many events land
 * in it. Nothing happens while the editor does not have focus, so a document
 * changed by a peer or a script does not drag the reader's page about.
 *
 * ```ts
 * createEditor({ extensions: [...starterKit, typewriter({ position: 0.4 })] })
 * editor.commands.toggleTypewriter()
 * ```
 */
export function typewriter(options: TypewriterOptions = {}): ExtensionDef<
  {
    enableTypewriter: Command
    disableTypewriter: Command
    toggleTypewriter: Command
  },
  TypewriterState
> {
  const name = 'typewriter'
  const wanted = Number(options.position)
  const position = Number.isFinite(wanted) ? Math.min(1, Math.max(0, wanted)) : 0.5
  const behavior: ScrollBehavior = options.smooth ? 'smooth' : 'auto'

  // One definition may serve several editors: the array it sits in is compiled
  // once and shared, so what belongs to an editor is kept against that editor.
  const sessions = new WeakMap<Editor, Session>()

  const enabled = (editor: Editor): boolean =>
    editor.extensionState<TypewriterState>(name)?.enabled !== false

  const scrollerFor = (): HTMLElement | null => {
    const chosen = options.scroller
    if (typeof chosen === 'function') return chosen()
    if (chosen) return chosen
    return (document.scrollingElement ?? document.documentElement) as HTMLElement | null
  }

  /** Where the caret is on screen, or the block it is in when there is no text to measure. */
  const caretBox = (): { top: number; height: number } | null => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0)
    const box = range.getBoundingClientRect()
    if (box.height > 0) return box
    const container = range.startContainer
    const element = container.nodeType === 1 ? (container as Element) : container.parentElement
    return element ? element.getBoundingClientRect() : null
  }

  const centre = (editor: Editor): void => {
    if (typeof window === 'undefined' || !enabled(editor)) return
    const view = editor.unsafe.view as unknown as { hasFocus: boolean } | null
    if (!view?.hasFocus) return
    const scroller = scrollerFor()
    if (!scroller) return
    const caret = caretBox()
    if (!caret) return

    const page =
      scroller === document.scrollingElement ||
      scroller === document.documentElement ||
      scroller === document.body
    const top = page ? 0 : scroller.getBoundingClientRect().top
    const height = page ? window.innerHeight : scroller.clientHeight
    const delta = caret.top + caret.height / 2 - (top + height * position)
    // Already there. A scroll of nothing still interrupts a smooth one in flight.
    if (Math.abs(delta) < 1) return

    const target = (page ? window : scroller) as Partial<Scrollable>
    if (typeof target.scrollBy !== 'function') return
    target.scrollBy({ top: delta, behavior })
  }

  const schedule = (editor: Editor): void => {
    const session = sessions.get(editor)
    if (!session || session.pending) return
    if (typeof window === 'undefined' || !enabled(editor)) return
    session.pending = true
    const frame = () => {
      session.pending = false
      // Unmounted while the frame was waiting.
      if (sessions.get(editor) === session) centre(editor)
    }
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(frame)
    else frame()
  }

  const stateOf = (ctx: Parameters<Command>[0]): TypewriterState =>
    (engine(ctx).pluginState(name) as TypewriterState | undefined) ?? ENABLED

  const set = (ctx: Parameters<Command>[0], on: boolean): boolean => {
    if (stateOf(ctx).enabled === on) return false
    engine(ctx).tr.setMeta(SET, on)
    return true
  }

  return {
    kind: 'extension',
    name,

    state: {
      init: () => ENABLED,
      apply: (ctx, previous) => {
        const on = engine(ctx).tr.getMeta(SET)
        if (typeof on !== 'boolean' || on === previous.enabled) return previous
        return on ? ENABLED : DISABLED
      },
    },

    commands: {
      enableTypewriter: (ctx) => set(ctx, true),
      disableTypewriter: (ctx) => set(ctx, false),
      toggleTypewriter: (ctx) => set(ctx, !stateOf(ctx).enabled),
    },

    onCreate(editor) {
      const session: Session = { pending: false, cleanups: [] }
      sessions.set(editor, session)
      session.cleanups.push(editor.on('selectionChange', () => schedule(editor)))
      session.cleanups.push(editor.on('change', () => schedule(editor)))
    },

    onDestroy(editor) {
      const session = sessions.get(editor)
      if (!session) return
      for (const off of session.cleanups) off()
      sessions.delete(editor)
    },
  }
}
