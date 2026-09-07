/**
 * What is ticked, and where that survives.
 *
 * Three places, in this order of authority:
 *
 *   1. the URL hash, because a configuration you cannot send to someone is not
 *      a configuration you can talk about;
 *   2. session storage, because leaving for the docs and coming back to find
 *      your editor replaced by the starter set is the bug this file was
 *      written to end — the hash goes with the URL you navigated away from,
 *      and the nav link carries no hash;
 *   3. the starter set, for a first visit.
 *
 * The hash is written on every change and read on arrival, so 1 and 2 agree
 * except in the one case where they should not: arriving on someone else's
 * link, where what they sent wins over what you last had open.
 */
import { DEFAULT_MODE, modeById } from '../../data/playground-modes'

/** A preset worth arriving on: enough to type into, small enough to read. */
export const DEFAULT_SELECTION = [
  'bold',
  'italic',
  'link',
  'heading',
  'bulletList',
  'listItem',
  'placeholder',
]

/** Always present. An editor without these has nowhere to put a character. */
export const FLOOR = ['document', 'paragraph', 'text']

/**
 * What a schema needs that the writer did not ask for.
 *
 * A list without its item is not a smaller list, it is a schema error. Ticking
 * the parent brings the parts rather than letting the editor throw, and the
 * parts appear ticked so the array on screen stays the truth.
 */
export const REQUIRES: Record<string, string[]> = {
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  listItem: ['bulletList'],
  taskList: ['taskItem'],
  taskItem: ['taskList'],
  table: ['tableRow', 'tableCell', 'tableHeader'],
  tableRow: ['table', 'tableCell', 'tableHeader'],
  tableCell: ['table', 'tableRow', 'tableHeader'],
  tableHeader: ['table', 'tableRow', 'tableCell'],
  columnList: ['column'],
  column: ['columnList'],
  details: ['detailsSummary'],
  detailsSummary: ['details'],
  footnote: ['footnoteRef', 'footnotes'],
  footnoteRef: ['footnote', 'footnotes'],
  footnotes: ['footnote', 'footnoteRef'],
  // Not schema dependencies but plain ones: a resize handle needs an image to
  // sit on, and a highlighter needs a fence to colour.
  imageResize: ['image'],
  codeHighlight: ['codeBlock'],
}

const STORE = 'matra-playground'

interface Stored {
  extensions?: string[]
  mode?: string
}

function read(): Stored {
  try {
    const raw = window.sessionStorage.getItem(STORE)
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    // Private mode, or a value from an older shape. Neither is worth an error.
    return {}
  }
}

function write(next: Stored): void {
  try {
    window.sessionStorage.setItem(STORE, JSON.stringify({ ...read(), ...next }))
  } catch {
    /* Storage is a convenience here, never a requirement. */
  }
}

/** Close the selection over what each ticked extension cannot work without. */
export function withRequirements(names: Iterable<string>): string[] {
  const out = new Set(names)
  let grew = true
  while (grew) {
    grew = false
    for (const name of [...out]) {
      for (const need of REQUIRES[name] ?? []) {
        if (!out.has(need)) {
          out.add(need)
          grew = true
        }
      }
    }
  }
  return [...out]
}

/**
 * The selection to open with.
 *
 * `known` is the catalogue, so a hash naming an extension that has since been
 * renamed drops that name instead of building an editor around nothing.
 */
export function initialSelection(known: Set<string>): string[] {
  const raw = window.location.hash.replace(/^#/, '')
  const fromHash = raw.split(',').filter((name) => known.has(name))
  if (fromHash.length) return fromHash

  const stored = (read().extensions ?? []).filter((name) => known.has(name))
  if (stored.length) return stored

  return DEFAULT_SELECTION
}

export function initialMode(): string {
  const stored = read().mode
  return stored && modeById(stored).id === stored ? stored : DEFAULT_MODE
}

export function rememberMode(id: string): void {
  write({ mode: id })
}

/**
 * Put the selection back in the URL, and in the session.
 *
 * The first argument to `replaceState` is `history.state`, not null. Astro's
 * client router keeps its own bookkeeping there — which entry this is, where it
 * was scrolled — and passing null wiped it on every rebuild. The symptom was
 * much stranger than the cause: pressing Back landed on `/playground` with the
 * *docs* page in the body, because the router no longer knew what that entry
 * held.
 */
export function remember(chosen: string[]): void {
  const sorted = [...chosen].sort()
  write({ extensions: sorted })
  const next = sorted.length ? `#${sorted.join(',')}` : window.location.pathname
  window.history.replaceState(window.history.state, '', next)
}
