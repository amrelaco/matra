/**
 * Turn the page into the product.
 *
 * Every block of prose becomes a real Matra editor, seeded from the HTML
 * already in it. That ordering is load-bearing: the content is written once as
 * ordinary markup, so it exists for a crawler, for a reader with JavaScript
 * off, and for a screen reader — and only then is it upgraded. A page whose
 * text lives only inside an editor instance is a page with no text.
 *
 * Nothing announces itself. There is no tooltip and no reset button: the cursor
 * changes when you are over text, and a reload puts everything back, which is
 * what a reload is for.
 */
import {
  blockquote,
  bold,
  bulletList,
  code,
  codeBlock,
  createEditor,
  document as doc,
  hardBreak,
  heading,
  highlight,
  history,
  horizontalRule,
  italic,
  link,
  listItem,
  orderedList,
  paragraph,
  strike,
  taskItem,
  taskList,
  text,
  typography,
  underline,
} from '@matrajs/core'

type Kit = readonly unknown[]

/** Marks only — for a headline or a caption that should stay one block. */
const LINE: Kit = [doc, paragraph, text, bold, italic, code, hardBreak, history, typography]

/** Prose: marks, plus the blocks a paragraph can legitimately become. */
const PROSE: Kit = [
  doc,
  paragraph,
  text,
  heading,
  blockquote,
  bulletList,
  orderedList,
  listItem,
  bold,
  italic,
  strike,
  code,
  link,
  underline,
  highlight,
  hardBreak,
  history,
  typography,
]

/** Everything, for the region that is meant to show everything. */
const FULL: Kit = [
  doc,
  paragraph,
  text,
  heading,
  blockquote,
  codeBlock,
  bulletList,
  orderedList,
  listItem,
  taskList,
  taskItem,
  horizontalRule,
  hardBreak,
  bold,
  italic,
  strike,
  code,
  link,
  underline,
  highlight,
  history,
  typography,
]

const KITS: Record<string, Kit> = {
  line: LINE,
  prose: PROSE,
  full: FULL,
  tasks: [
    doc,
    paragraph,
    text,
    bulletList,
    orderedList,
    listItem,
    taskList,
    taskItem,
    bold,
    italic,
    hardBreak,
    history,
  ],
}

/**
 * Text that is upgraded automatically.
 *
 * Everything a reader would call prose, and nothing that is really a control.
 * Buttons, links in navigation, code samples people copy, and table cells stay
 * exactly as they were rendered.
 */
const AUTO = 'h1, h2, h3, p, blockquote, ul:not([data-type]), ol'

const SKIP = 'nav, footer, pre, code, table, .btn, .kicker, [data-static], [data-editable]'

function kitFor(element: HTMLElement): Kit {
  const named = element.dataset.editable
  if (named && KITS[named]) return KITS[named] as Kit
  // A heading is one line; a paragraph might reasonably become a list.
  return /^H[1-3]$/.test(element.tagName) ? LINE : PROSE
}

function upgrade(element: HTMLElement): void {
  if (element.dataset.live === 'true') return
  const seed = element.innerHTML.trim()
  if (!seed) return

  try {
    const editor = createEditor({ extensions: kitFor(element) as never, content: seed })
    editor.mount(element)
    element.dataset.live = 'true'
    element.setAttribute('aria-label', 'Editable text. Reload the page to restore it.')
  } catch (error) {
    // A region that will not upgrade stays as the HTML it already was, which is
    // readable and correct. Failing loudly here would break the page to
    // announce that a demo is missing.
    console.warn('Matra: could not make this editable', element, error)
  }
}

/** Everything that should become an editor, marked or inferred. */
function regions(): HTMLElement[] {
  const marked = Array.from(document.querySelectorAll<HTMLElement>('[data-editable]'))
  const auto = Array.from(document.querySelectorAll<HTMLElement>(AUTO)).filter((element) => {
    if (element.closest(SKIP)) return false
    // A paragraph inside something already being upgraded is that editor's
    // problem, not a second editor's.
    return !marked.some((region) => region !== element && region.contains(element))
  })
  return [...marked, ...auto]
}

/**
 * Upgrade as things approach the viewport.
 *
 * Every paragraph on the page becoming an editor during first paint would spend
 * the opening moment proving how slow the thing is. The observer means what you
 * can see is ready before you reach it, and the rest costs nothing until then.
 */
function watch(): void {
  const found = regions()
  if (found.length === 0) return

  if (!('IntersectionObserver' in window)) {
    for (const element of found) upgrade(element)
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        upgrade(entry.target as HTMLElement)
        observer.unobserve(entry.target)
      }
    },
    { rootMargin: '600px 0px' },
  )

  for (const element of found) observer.observe(element)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', watch)
} else {
  watch()
}
