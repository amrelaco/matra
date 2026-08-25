/**
 * Turn the page into the product.
 *
 * Every piece of text becomes a real Matra editor, seeded from the HTML already
 * in it — headings, paragraphs, quotes, list items, table cells, captions and
 * the small uppercase labels. That ordering is load-bearing: the content is
 * written once as ordinary markup, so it exists for a crawler, for a reader
 * with JavaScript off, and for a screen reader, and only then is it upgraded.
 * A page whose text lives only inside an editor instance is a page with no
 * text.
 *
 * Nothing announces itself. No tooltip, no frame, no reset button: the caret
 * appears, and a reload puts everything back.
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
  tableCell,
  tableHeader,
  table as tableNode,
  tableRow,
  taskItem,
  taskList,
  text,
  typography,
  underline,
} from '@matrajs/core'

type Kit = readonly unknown[]

const MARKS = [bold, italic, strike, code, underline, highlight] as const

/** One line, marks only — a label, a caption, a heading, a table cell. */
const LINE: Kit = [doc, paragraph, text, ...MARKS, hardBreak, history, typography]

/** Prose: marks plus the blocks a paragraph can legitimately become. */
const PROSE: Kit = [
  doc,
  paragraph,
  text,
  heading,
  blockquote,
  bulletList,
  orderedList,
  listItem,
  ...MARKS,
  link,
  hardBreak,
  history,
  typography,
]

/** A whole table, so cells are editable and the structure survives. */
const TABLE: Kit = [
  doc,
  paragraph,
  text,
  tableNode,
  tableRow,
  tableCell,
  tableHeader,
  ...MARKS,
  hardBreak,
  history,
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
  ...MARKS,
  link,
  history,
  typography,
]

const KITS: Record<string, Kit> = { line: LINE, prose: PROSE, table: TABLE, full: FULL }

/** Text that upgrades on its own. */
const AUTO = [
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'blockquote',
  'li',
  'figcaption',
  'dt',
  'dd',
  '.kicker',
  '.cell-head',
  '.packages',
  '.md-label',
  '.count',
  '.file',
  '.proof b',
  '.proof span',
  '.bubble',
].join(',')

/**
 * What stays as rendered.
 *
 * Anything whose click has to do something: a link must navigate and a button
 * must fire. Inside a contenteditable region a click places a caret instead, so
 * making the navigation editable would be a page that looks the same and no
 * longer works. Code samples stay too, because people copy them.
 */
const SKIP = [
  'nav',
  'pre',
  'code',
  '.btn',
  // Its <b> and <span> are stacked by CSS and carry meaning as separate
  // elements; one editor over the whole item flattens them onto one line and
  // "22.3 kB" runs straight into its own caption.
  '.proof li',
  '[data-static]',
  '[data-editable]',
  '[data-live]',
].join(',')

const isInteractive = (element: Element) =>
  element.matches('a, button') || element.querySelector('a, button') !== null

/** A label is one line; a paragraph might reasonably become a list. */
function kitFor(element: HTMLElement): Kit {
  const named = element.dataset.editable
  if (named && KITS[named]) return KITS[named] as Kit
  if (/^(H[1-4]|LI|TD|TH|FIGCAPTION|DT|DD)$/.test(element.tagName)) return LINE
  if (element.classList.contains('kicker')) return LINE
  return element.tagName === 'P' ? PROSE : LINE
}

function upgrade(element: HTMLElement): void {
  if (element.dataset.live === 'true') return
  const original = element.innerHTML
  const seed = original.trim()
  if (!seed) return

  try {
    const editor = createEditor({ extensions: kitFor(element) as never, content: seed })
    editor.mount(element)

    // Put it back if the upgrade emptied it. A schema that cannot represent
    // some markup drops it, and a section of the page silently disappearing is
    // far worse than a section that is merely not editable.
    if (seed && !element.textContent?.trim() && stripTags(seed)) {
      editor.destroy()
      element.innerHTML = original
      return
    }

    element.dataset.live = 'true'
    element.setAttribute('aria-label', 'Editable text. Reload the page to restore it.')
  } catch (error) {
    element.innerHTML = original
    console.warn('Matra: could not make this editable', element, error)
  }
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, '').trim()

/**
 * A table becomes one editor rather than one per cell.
 *
 * Sixty cells would be sixty editors, and each would be an island — no tabbing
 * between them, no sense that it is a table at all. One editor over the whole
 * thing means the cells are editable *and* the table is still a table.
 */
function wrapTable(table: HTMLTableElement): HTMLElement | null {
  if (table.closest(SKIP) || isInteractive(table)) return null
  const holder = document.createElement('div')
  holder.dataset.editable = 'table'
  table.replaceWith(holder)
  holder.innerHTML = table.outerHTML
  return holder
}

function regions(): HTMLElement[] {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table'))
    .map(wrapTable)
    .filter((element): element is HTMLElement => element !== null)

  const marked = Array.from(document.querySelectorAll<HTMLElement>('[data-editable]'))

  const auto = Array.from(document.querySelectorAll<HTMLElement>(AUTO)).filter((element) => {
    if (element.closest(SKIP)) return false
    if (isInteractive(element)) return false
    // Text inside something already being upgraded belongs to that editor.
    return !marked.some((region) => region !== element && region.contains(element))
  })

  return [...new Set([...tables, ...marked, ...auto])]
}

/**
 * Upgrade as things approach the viewport.
 *
 * Every paragraph and cell on the page becoming an editor during first paint
 * would spend the opening moment proving how slow the thing is. The observer
 * means what you can see is ready before you reach it.
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
