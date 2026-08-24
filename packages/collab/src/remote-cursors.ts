import type { Command, Ctx, DecorationSpec, ExtensionDef, Pos } from '@matrajs/core'
import type { Presence } from './types'

/** The slice of the engine this extension needs, reached the way collab does. */
interface CursorEngine {
  tr: {
    docChanged: boolean
    doc: { content: { size: number } }
    mapping: { map(pos: number, assoc?: -1 | 1): number }
    getMeta(key: string): unknown
    setMeta(key: string, value: unknown): unknown
  }
  pluginState(key: string): unknown
}

function readEngine(ctx: Ctx): CursorEngine {
  const access = (ctx as unknown as Record<symbol, CursorEngine>)[Symbol.for('matra.engine')]
  if (!access) throw new Error('Matra: remoteCursors ctx was created outside the engine')
  return access
}

/** Everyone else's caret, in this client's coordinates. */
export type RemoteCursors = ReadonlyMap<string, Presence>

/**
 * A colour per person, chosen from the id so it is stable everywhere.
 *
 * Deriving it beats assigning one, because two clients that never speak still
 * agree on what colour a third person is.
 */
export function colorFor(clientId: string): string {
  let hash = 0
  for (let i = 0; i < clientId.length; i++) hash = (hash * 31 + clientId.charCodeAt(i)) | 0
  // Fixed saturation and lightness keep every colour legible on white and dark.
  return `hsl(${Math.abs(hash) % 360} 70% 45%)`
}

const META = 'matra-presence'

/** What a presence message asks the extension to do. */
type PresenceAction = { set: Presence } | { remove: string } | { clear: true }

/**
 * Other people's carets and selections, drawn as decorations.
 *
 * A remote caret arrives as a position in the *sender's* document. The instant
 * anything is typed locally that number is wrong. The only correct fix is to
 * map it through the same steps the local document went through, which is why
 * this is an extension rather than a helper: extension state is reduced inside
 * the transaction pipeline, where the mapping actually lives.
 *
 * Clamping to the document size — the obvious shortcut — is wrong. Insert ten
 * characters at the start and every later caret should move ten forward;
 * clamping leaves them all pointing at the wrong word.
 */
export function remoteCursors(): ExtensionDef<
  {
    setPresence: Command<[presence: Presence]>
    removePresence: Command<[clientId: string]>
    clearPresence: Command
  },
  RemoteCursors
> {
  return {
    kind: 'extension',
    name: 'remoteCursors',

    state: {
      init: () => new Map<string, Presence>(),

      apply(ctx, previous) {
        const { tr } = readEngine(ctx)
        const action = tr.getMeta(META) as PresenceAction | undefined
        let next = previous

        // Map first, then apply the message. A message arriving in the same
        // transaction as an edit already describes the document after it.
        if (tr.docChanged) {
          // This transaction's own mapping, not ctx.mark() — that one maps
          // changes made *after* it is taken, and by the time a reducer runs
          // the change it must account for is the one already in `tr`.
          const mapped = new Map<string, Presence>()
          for (const [id, person] of previous) {
            mapped.set(id, {
              ...person,
              anchor: tr.mapping.map(person.anchor),
              head: tr.mapping.map(person.head),
            })
          }
          next = mapped
        }

        if (!action) return next

        const copy = new Map(next)
        if ('clear' in action) copy.clear()
        else if ('remove' in action) copy.delete(action.remove)
        else if (isPlacedPresence(action.set)) copy.set(action.set.clientId, action.set)
        return copy
      },
    },

    decorations(ctx) {
      const { tr, pluginState } = readEngine(ctx)
      const people = pluginState('remoteCursors') as RemoteCursors | undefined
      if (!people?.size) return []

      const size = tr.doc.content.size
      const out: DecorationSpec[] = []

      for (const person of people.values()) {
        // A peer can send anything. A caret outside the document would throw
        // deep in the decoration mapper, so it is dropped here instead.
        const anchor = clamp(person.anchor, size)
        const head = clamp(person.head, size)
        if (anchor === null || head === null) continue

        const color = colorFor(person.clientId)
        const name = readName(person)

        if (anchor !== head) {
          out.push({
            type: 'inline',
            from: Math.min(anchor, head) as Pos,
            to: Math.max(anchor, head) as Pos,
            attrs: {
              class: 'matra-remote-selection',
              style: `background-color: ${color}; opacity: 0.25`,
            },
          })
        }

        out.push({
          type: 'widget',
          pos: head as Pos,
          // Keyed by client so the renderer reuses the caret element instead of
          // tearing it down and rebuilding it on every keystroke.
          key: `cursor-${person.clientId}`,
          side: 1,
          render: () => renderCaret(color, name),
        })
      }

      return out
    },

    commands: {
      setPresence: (ctx, presence) => {
        if (!isPlacedPresence(presence)) return false
        readEngine(ctx).tr.setMeta(META, { set: presence })
        return true
      },
      removePresence: (ctx, clientId) => {
        if (typeof clientId !== 'string' || !clientId) return false
        readEngine(ctx).tr.setMeta(META, { remove: clientId })
        return true
      },
      clearPresence: (ctx) => {
        readEngine(ctx).tr.setMeta(META, { clear: true })
        return true
      },
    },
  }
}

/** Is this a presence message we can place, or noise from the wire? */
function isPlacedPresence(value: unknown): value is Presence {
  if (!value || typeof value !== 'object') return false
  const person = value as Presence
  return (
    typeof person.clientId === 'string' &&
    person.clientId.length > 0 &&
    isPlace(person.anchor) &&
    isPlace(person.head)
  )
}

function isPlace(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function clamp(value: number, size: number): number | null {
  if (!isPlace(value)) return null
  return Math.min(value, size)
}

/**
 * The caret element.
 *
 * Built with `document.createElement` and `textContent` rather than a template
 * string: the label is a display name chosen by another user, and it must not
 * be able to become markup.
 */
function renderCaret(color: string, name: string | null): HTMLElement {
  const caret = document.createElement('span')
  caret.className = 'matra-remote-cursor'
  caret.style.borderLeft = `2px solid ${color}`

  if (name !== null) {
    const label = document.createElement('span')
    label.className = 'matra-remote-cursor-label'
    label.style.backgroundColor = color
    label.textContent = name
    caret.appendChild(label)
  }
  return caret
}

/** A display name, if the sender supplied a usable one. */
function readName(person: Presence): string | null {
  const name = person.meta?.name
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed) return null
  // A name is a label, not an essay; a peer sending 10kB of it is an attack.
  return trimmed.slice(0, 40)
}

/** Enough styling to see a caret. Drop it in a stylesheet, or write your own. */
export const remoteCursorCSS = `
.matra-remote-cursor {
  position: relative;
  margin-left: -1px;
  margin-right: -1px;
  pointer-events: none;
  word-break: normal;
}
.matra-remote-cursor-label {
  position: absolute;
  top: -1.2em;
  left: -2px;
  padding: 0 4px;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  user-select: none;
}
.matra-remote-selection {
  border-radius: 2px;
}
`
