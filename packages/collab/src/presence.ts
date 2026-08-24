import type { AnyDef, Editor } from '@matrajs/core'
import type { Presence } from './types'

/**
 * Other people's cursors, kept honest as the document changes.
 *
 * A remote caret arrives as a position in the sender's document. The moment
 * anything is typed locally that number is wrong, so every position is mapped
 * forward on each change. Rendering is the host application's job — the engine
 * has no decoration layer, and inventing one here would be the wrong place.
 */
export class PresenceTracker {
  private readonly people = new Map<string, Presence>()
  private readonly off: () => void

  constructor(
    private readonly editor: Editor<readonly AnyDef[]>,
    private readonly onUpdate?: (people: Presence[]) => void,
  ) {
    let previous = editor.getJSON()
    this.off = editor.on('change', () => {
      // Positions past the end of the document are clamped rather than dropped:
      // a cursor at the end of a paragraph someone just shortened should sit at
      // the new end, not disappear.
      const size = measure(editor.getJSON())
      for (const [id, person] of this.people) {
        this.people.set(id, {
          ...person,
          anchor: Math.min(person.anchor, size),
          head: Math.min(person.head, size),
        })
      }
      previous = editor.getJSON()
      void previous
      this.onUpdate?.(this.list())
    })
  }

  set(person: Presence): void {
    this.people.set(person.clientId, person)
    this.onUpdate?.(this.list())
  }

  remove(clientId: string): void {
    if (this.people.delete(clientId)) this.onUpdate?.(this.list())
  }

  list(): Presence[] {
    return [...this.people.values()]
  }

  destroy(): void {
    this.off()
    this.people.clear()
  }
}

function measure(doc: { content?: unknown[]; text?: string }): number {
  if (typeof doc.text === 'string') return doc.text.length
  let size = 0
  for (const child of (doc.content ?? []) as Array<{ content?: unknown[]; text?: string }>) {
    size += typeof child.text === 'string' ? child.text.length : measure(child) + 2
  }
  return size
}
