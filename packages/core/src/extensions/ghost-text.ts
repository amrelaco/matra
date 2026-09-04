import type { EditorState } from '../engine/state'
import { engine } from '../internal'
import type { Command, Editor, ExtensionDef, Pos } from '../types'

/** What a suggester is told. The block the caret is in, split at the caret. */
export interface GhostContext {
  before: string
  after: string
  editor: Editor
}

export interface GhostTextOptions {
  /**
   * Propose what comes next. Return nothing to propose nothing.
   *
   * Asked after the caret has rested for `delay`, and only the latest answer
   * counts: a reply that arrives after another keystroke is dropped, so a
   * slow model never writes into a sentence that has moved on.
   */
  suggest: (
    context: GhostContext,
  ) => string | null | undefined | Promise<string | null | undefined>
  /** Milliseconds the caret rests before asking. Default 300. */
  delay?: number
  /** Characters needed before the caret in its block before asking. Default 1. */
  minBefore?: number
  /** Class on the rendered suggestion. Default `matra-ghost`. */
  className?: string
}

export interface GhostTextState {
  text: string | null
  at: Pos | null
}

const META = 'ghostText:set'
const NONE: GhostTextState = { text: null, at: null }

/**
 * Inline completion: grey text after the caret, Tab to take it.
 *
 * The suggestion is a decoration and never part of the document, so it is not
 * saved, not sent to collaborators and not undone. Any keystroke or caret move
 * dismisses it — a ghost that stays where it was while the sentence changes
 * underneath it is worse than none — and Tab inserts it at the position it was
 * shown at, as one ordinary edit.
 *
 * Where the text comes from is yours: a model, a phrase table, the next line
 * of the previous draft. This only asks, waits, and draws.
 */
export function ghostText(options: GhostTextOptions): ExtensionDef<
  {
    setGhostText: Command<[text: string | null]>
    acceptGhostText: Command
    acceptGhostWord: Command
    dismissGhostText: Command
  },
  GhostTextState
> {
  const delay = options.delay ?? 300
  const minBefore = options.minBefore ?? 1
  const className = options.className ?? 'matra-ghost'
  type Commands = { setGhostText(text: string | null): boolean }
  const sessions = new WeakMap<Editor, () => void>()

  const accept = (ctx: Parameters<Command>[0], take: (text: string) => string): boolean => {
    const state = engine(ctx).pluginState('ghostText') as GhostTextState | undefined
    if (!state?.text || state.at === null) return false
    const text = take(state.text)
    if (!text) return false
    // The reducer clears the ghost: this is a document change.
    return ctx.insert(text, state.at)
  }

  return {
    kind: 'extension',
    name: 'ghostText',
    // Before lists and indentation, which also want Tab. This returns false
    // when there is nothing to accept, and the key falls through to them.
    priority: 100,

    state: {
      init: () => NONE,
      apply: (ctx, previous) => {
        const { tr } = engine(ctx)
        const meta = tr.getMeta(META) as GhostTextState | undefined
        if (meta !== undefined) return meta
        if (previous.text === null) return previous
        return tr.docChanged || tr.selectionSet ? NONE : previous
      },
    },

    decorations: (ctx) => {
      const state = engine(ctx).pluginState('ghostText') as GhostTextState | undefined
      if (!state?.text || state.at === null) return []
      const { text, at } = state
      return [
        {
          type: 'widget',
          pos: at,
          side: 1,
          key: `ghost:${at}:${text}`,
          render: () => {
            const span = document.createElement('span')
            span.className = className
            span.textContent = text
            span.contentEditable = 'false'
            span.setAttribute('aria-hidden', 'true')
            return span
          },
        },
      ]
    },

    commands: {
      setGhostText: (ctx, text) => {
        const access = engine(ctx)
        const previous = access.pluginState('ghostText') as GhostTextState | undefined
        const selection = access.tr.selection
        if (!text || !selection.empty) {
          if (!previous?.text) return false
          access.tr.setMeta(META, NONE)
          return true
        }
        access.tr.setMeta(META, { text, at: selection.from as Pos })
        return true
      },
      acceptGhostText: (ctx) => accept(ctx, (text) => text),
      acceptGhostWord: (ctx) => accept(ctx, (text) => (/^\s*\S+\s?/.exec(text) ?? [''])[0]),
      dismissGhostText: (ctx) => {
        const access = engine(ctx)
        const state = access.pluginState('ghostText') as GhostTextState | undefined
        if (!state?.text) return false
        access.tr.setMeta(META, NONE)
        return true
      },
    },

    keys: {
      Tab: 'acceptGhostText',
      Escape: 'dismissGhostText',
    },

    onCreate: (editor) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      let sequence = 0
      const commands = editor.commands as unknown as Commands

      const ask = () => {
        timer = null
        const asked = ++sequence
        if (!editor.selection.empty) return
        const state = editor.unsafe.state as EditorState
        const $from = state.selection.$from
        if (!$from.parent.isTextblock) return
        const before = $from.parent.textBetween(0, $from.parentOffset)
        if (before.length < minBefore) return
        const after = $from.parent.textBetween($from.parentOffset, $from.parent.content.size)

        const settle = (text: string | null | undefined) => {
          // Only the answer to the latest question, and only if nothing has
          // happened since it was asked.
          if (asked !== sequence || editor.unsafe.state !== state) return
          if (typeof text === 'string' && text) commands.setGhostText(text)
        }
        try {
          const result = options.suggest({ before, after, editor })
          if (result && typeof (result as Promise<unknown>).then === 'function') {
            ;(result as Promise<string | null | undefined>).then(settle, () => undefined)
          } else {
            settle(result as string | null | undefined)
          }
        } catch {
          // A suggester that throws has suggested nothing.
        }
      }

      const schedule = () => {
        sequence++
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(ask, delay)
      }

      const offChange = editor.on('change', schedule)
      const offSelection = editor.on('selectionChange', schedule)
      sessions.set(editor, () => {
        sequence++
        if (timer !== null) clearTimeout(timer)
        timer = null
        offChange()
        offSelection()
      })
    },

    onDestroy: (editor) => {
      sessions.get(editor)?.()
      sessions.delete(editor)
    },
  }
}

export const ghostTextCSS = `
.matra-ghost {
  opacity: 0.45;
  pointer-events: none;
  user-select: none;
  white-space: pre-wrap;
}
`
