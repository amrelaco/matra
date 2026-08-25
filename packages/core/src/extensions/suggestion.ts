import { engine } from '../internal'
import type { Command, DecorationSpec, ExtensionDef, Pos, Range } from '../types'

export interface SuggestionOptions {
  /** The character that opens it. `@` for mentions, `/` for commands. */
  char: string
  /**
   * Extension name, and therefore the key `editor.extensionState` is read by.
   * Two suggestions on one editor need two names.
   */
  name?: string
  /** Only fire at the start of a block. What `/` menus usually want. */
  startOfLine?: boolean
  /** Let the query contain spaces. Names have spaces; commands do not. */
  allowSpaces?: boolean
  /** Give up after this many characters, so a stray `@` stops matching. */
  maxLength?: number
  /** Class on the decoration over the active range, for positioning a popup. */
  decorationClass?: string
}

/**
 * The extension's own state.
 *
 * `dismissedAt` is why this is not simply `SuggestionState | null`: Escape has
 * to keep it shut, and "shut" has to survive the transactions that arrow keys
 * produce. Read it with `activeSuggestion` rather than reaching in here.
 */
export interface SuggestionStore {
  active: SuggestionState | null
  /** Trigger position of a suggestion the user dismissed. */
  dismissedAt: number | null
}

/** What is currently being typed, or null when nothing is. */
export interface SuggestionState {
  /** The text after the trigger character. Empty right after typing it. */
  query: string
  /** Trigger character and query together — what accepting replaces. */
  range: Range
  /** Document position of the trigger character. */
  from: Pos
}

/**
 * Detect `@name` and `/command` as they are typed, and report what was typed.
 *
 * Deliberately headless, like the rest of this: it finds the trigger, tracks
 * the query and marks the range, and never renders a list. A dropdown is
 * interface, and the interface is yours — a suggestion extension that ships its
 * own popup is one you have to fight the moment your design differs from the
 * author's.
 *
 * ```ts
 * const editor = createEditor({ extensions: [...starterKit, suggestion({ char: '@' })] })
 *
 * editor.on('change', () => {
 *   const active = activeSuggestion(editor)
 *   if (!active) return hideMyPopup()
 *   showMyPopup(search(active.query))
 * })
 *
 * // when someone picks an entry
 * editor.commands.acceptSuggestion({ type: 'mention', attrs: { id, label } })
 * ```
 *
 * Position the popup against `.matra-suggestion` in the DOM: the decoration
 * marks exactly the text being replaced, so a `getBoundingClientRect` on it is
 * the anchor you want.
 */
export function suggestion(options: SuggestionOptions): ExtensionDef<
  {
    acceptSuggestion: Command<[replacement: unknown]>
    cancelSuggestion: Command
  },
  SuggestionStore
> {
  const char = options.char
  const name = options.name ?? 'suggestion'
  const maxLength = options.maxLength ?? 60
  const decorationClass = options.decorationClass ?? 'matra-suggestion'
  const CANCELLED = `${name}:cancelled`

  return {
    kind: 'extension',
    name,

    state: {
      init: () => ({ active: null, dismissedAt: null }),
      apply(ctx, previous) {
        const { tr } = engine(ctx)
        const shut = (dismissedAt: number | null) => ({ active: null, dismissedAt })

        if (tr.getMeta(CANCELLED)) return shut(previous.active?.from ?? null)

        const found = detect(tr, char, options, maxLength)
        if (!found) return shut(null)

        // Dismissed stays dismissed while the caret sits on the same trigger.
        // Without this, Escape closes the menu and the next arrow key reopens
        // it, which is the same as Escape not working.
        if (previous.dismissedAt !== null && previous.dismissedAt === found.from) {
          // Typing more of the query is a new intent, so it opens again.
          const grew = previous.active === null && found.query.length > 0 && tr.docChanged
          if (!grew) return shut(previous.dismissedAt)
        }

        return { active: found, dismissedAt: null }
      },
    },

    decorations(ctx) {
      const active = (engine(ctx).pluginState(name) as SuggestionStore | undefined)?.active
      if (!active) return []
      const spec: DecorationSpec = {
        type: 'inline',
        from: active.range.from,
        to: active.range.to,
        attrs: { class: decorationClass },
      }
      return [spec]
    },

    commands: {
      /**
       * Replace the trigger and query with whatever was chosen.
       *
       * Takes content rather than a string so a mention can be a node — a
       * mention that is only text is one a user can half-delete into nonsense.
       */
      acceptSuggestion: (ctx, replacement) => {
        const active = (engine(ctx).state.pluginState(name) as SuggestionStore | undefined)
          ?.active
        if (!active) return false
        if (replacement === undefined || replacement === null) return false
        return ctx.replace(active.range, replacement as never)
      },

      cancelSuggestion: (ctx) => {
        const active = (engine(ctx).state.pluginState(name) as SuggestionStore | undefined)
          ?.active
        if (!active) return false
        engine(ctx).tr.setMeta(CANCELLED, true)
        return true
      },
    },

    keys: { Escape: 'cancelSuggestion' },
  }
}

/** Find the trigger and query in the block the caret is in. */
function detect(
  tr: {
    selection: {
      empty: boolean
      head: number
      $from: { parent: { isTextblock: boolean }; start(): number }
    }
    doc: { textBetween(from: number, to: number): string }
  },
  char: string,
  options: SuggestionOptions,
  maxLength: number,
): SuggestionState | null {
  const selection = tr.selection
  if (!selection.empty) return null
  if (!selection.$from.parent.isTextblock) return null

  const blockStart = selection.$from.start()
  const head = selection.head
  const text = tr.doc.textBetween(blockStart, head)

  const index = lastTriggerIndex(text, char, options.startOfLine === true)
  if (index === -1) return null

  const query = text.slice(index + char.length)
  if (query.length > maxLength) return null
  // A space normally ends it. Without this, typing "@" then a whole sentence
  // leaves the menu open over the rest of the paragraph.
  if (!options.allowSpaces && /\s/.test(query)) return null
  // A newline ends it whether spaces are allowed or not.
  if (/[\n\r]/.test(query)) return null

  return {
    query,
    from: (blockStart + index) as Pos,
    range: { from: (blockStart + index) as Pos, to: head as Pos },
  }
}

/**
 * Where the trigger is, or -1.
 *
 * It has to be at the start of the block or after whitespace, which is what
 * stops an email address opening a mention menu halfway through the domain.
 */
function lastTriggerIndex(text: string, char: string, startOfLine: boolean): number {
  if (startOfLine) return text.startsWith(char) ? 0 : -1

  for (let i = text.length - char.length; i >= 0; i--) {
    if (!text.startsWith(char, i)) continue
    if (i === 0) return i
    const before = text[i - 1] as string
    return /\s/.test(before) ? i : -1
  }
  return -1
}

/** Enough styling to see the range a suggestion covers. */
export const suggestionCSS = `
.matra-suggestion { background: rgba(58, 61, 146, 0.12); border-radius: 2px; }
.matra-mention {
  background: rgba(58, 61, 146, 0.12);
  border-radius: 3px;
  padding: 0 3px;
  white-space: nowrap;
}
`

/**
 * What is being typed right now, or null.
 *
 * A function rather than a documented magic string, so the host is not reaching
 * into an internal shape it would then be coupled to.
 */
export function activeSuggestion(
  editor: { extensionState<S>(name: string): S | undefined },
  name = 'suggestion',
): SuggestionState | null {
  return editor.extensionState<SuggestionStore>(name)?.active ?? null
}
