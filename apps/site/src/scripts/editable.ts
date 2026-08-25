/**
 * Turn the page into the product.
 *
 * Every region marked `data-editable` becomes a real Matra editor, seeded from
 * the HTML already in it. That ordering matters: the content is written once,
 * as ordinary markup, so it is there for a crawler, for a reader with
 * JavaScript off, and for a screen reader — and only then is it upgraded. A
 * page whose text exists only inside an editor instance is a page with no text.
 *
 * Each region names the extensions that make it work, so the demonstration is
 * specific: the heading you are editing really is running the typography
 * extension, and the checklist really is the task-list one.
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

const INLINE: Kit = [doc, paragraph, text, bold, italic, code, hardBreak, history]

/** Named extension sets, so a region declares what it is demonstrating. */
const KITS: Record<string, Kit> = {
  /** Prose with the punctuation rules on: quotes curl, -- becomes an em dash. */
  typography: [
    doc,
    paragraph,
    text,
    bold,
    italic,
    strike,
    code,
    link,
    underline,
    highlight,
    heading,
    hardBreak,
    history,
    typography,
  ],
  /** Everything, for regions that want to show off. */
  full: [
    doc,
    paragraph,
    text,
    heading,
    blockquote,
    codeBlock,
    bulletList,
    orderedList,
    listItem,
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
  ],
  /** Checklists. */
  tasks: [
    doc,
    paragraph,
    text,
    bold,
    italic,
    bulletList,
    orderedList,
    listItem,
    taskList,
    taskItem,
    hardBreak,
    history,
  ],
  /** A single line of prose and two marks — headlines, captions, cells. */
  inline: INLINE,
}

const live: { destroy(): void }[] = []

function upgrade(element: HTMLElement): void {
  if (element.dataset.live === 'true') return

  const kit = KITS[element.dataset.editable || 'inline'] ?? INLINE
  const seed = element.innerHTML.trim()
  if (!seed) return

  // A kit without hardBreak silently eats every <br>, which joins the words
  // either side of it. That is invisible in review and obvious on the page:
  // the first version of this shipped a headline reading "you arealready".

  try {
    const editor = createEditor({
      extensions: kit as never,
      content: seed,
    })
    editor.mount(element)
    element.dataset.live = 'true'
    element.setAttribute(
      'aria-label',
      `Editable demonstration: ${element.dataset.hint ?? 'Matra editor'}. Changes are local and reset on reload.`,
    )
    live.push(editor)
  } catch (error) {
    // A region that will not upgrade stays as the HTML it already was, which is
    // readable and correct. Failing loudly here would break the page to
    // announce that a demo is missing.
    console.warn('Matra: could not make a region editable', element, error)
  }
}

/**
 * Upgrade regions as they approach the viewport.
 *
 * Twenty editors created during the first paint would spend the page's opening
 * moment proving how slow it is. The observer means the visible ones are ready
 * before anyone reaches them and the rest cost nothing until scrolled to.
 */
function watch(): void {
  const regions = Array.from(document.querySelectorAll<HTMLElement>('[data-editable]'))
  if (regions.length === 0) return

  if (!('IntersectionObserver' in window)) {
    for (const region of regions) upgrade(region)
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
    { rootMargin: '400px 0px' },
  )

  for (const region of regions) observer.observe(region)
}

/** Put every region back the way the server sent it. */
function reset(): void {
  window.location.reload()
}

function ready(): void {
  watch()

  const button = document.getElementById('reset-page')
  button?.addEventListener('click', reset)

  // Announce the mechanic once, quietly, to people who have not noticed it.
  const banner = document.getElementById('editable-banner')
  if (banner && !sessionStorage.getItem('matra-banner-seen')) {
    banner.removeAttribute('hidden')
    sessionStorage.setItem('matra-banner-seen', '1')
    banner.querySelector('button')?.addEventListener('click', () => banner.remove())
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ready)
} else {
  ready()
}
