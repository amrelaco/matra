/**
 * A browser-shaped global scope, from happy-dom, for running built bundles
 * in Node.
 *
 * The install matrix and the exercise runner both need one, and both need
 * the same list of globals: a bundle that reaches for `KeyboardEvent` or
 * `MouseEvent` at module scope must find it, and a list kept in two places
 * is a list that drifts.
 */
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '../..')

const GLOBALS = [
  'window',
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLIFrameElement',
  'SVGElement',
  'Text',
  'Comment',
  'DocumentFragment',
  'MutationObserver',
  'getSelection',
  'DOMParser',
  'navigator',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
  'CustomEvent',
  'Event',
  'KeyboardEvent',
  'MouseEvent',
  'InputEvent',
  'Range',
]

/** Make a window and put its globals where a bundle will look for them. */
export async function browserlike(url = 'http://localhost/') {
  const { Window } = await import(
    pathToFileURL(join(ROOT, 'node_modules/happy-dom/lib/index.js')).href
  )
  const window = new Window({ url })
  for (const key of GLOBALS) {
    try {
      globalThis[key] = key === 'window' ? window : window[key]
    } catch {}
  }
  return window
}
