/**
 * The margin: everything about the document that is not the document.
 *
 * Four panels, each one present only while the extension behind it is ticked —
 * an outline needs `tableOfContents`, a word count needs `characterCount`,
 * find-and-replace needs `search`. That is the same contract the toolbar keeps,
 * applied to panels instead of buttons, and it is why the margin is never
 * showing a number nothing is computing.
 *
 * The first panel is the exception and the reason this file is long: a list of
 * what you have ticked and what to *do* to see each one working, with a button
 * that does it for you. Ticking a box changes an array; this is where the array
 * turns back into something you can watch happen.
 */
import { DEMOS, type Demo } from '../../data/playground-demos'
import { tableOfContents } from './registry'

type AnyEditor = {
  commands: Record<string, ((...args: unknown[]) => boolean) | undefined>
  extensionState: <S>(name: string) => S | undefined
  getJSON: () => unknown
  selection: { empty: boolean }
}

export interface RailHost {
  root: HTMLElement
  /**
   * The editor, asked for rather than handed over.
   *
   * Every tick rebuilds it, and this panel is only redrawn when the *selection*
   * changes — so a row rendered three ticks ago would be holding a destroyed
   * editor. Its commands still answer, and still return true, and nothing
   * happens to the document anybody can see.
   */
  editor: () => AnyEditor | null
  /** The mounted editor element, for demos that place a selection by hand. */
  doc: HTMLElement
  /**
   * Turn markup into nodes this schema can hold.
   *
   * `insert` takes nodes or a string, and a string is *text* — `insert('<hr>')`
   * types five characters. The demos are written as markup because markup is
   * what a reader can check, so somebody has to parse it, and only the page
   * knows which extensions are ticked. That is `index.ts`.
   */
  parse: (html: string) => unknown[] | null
}

const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T | null =>
  root.querySelector<T>(sel)

/**
 * Is the caret already somewhere in the document?
 *
 * A demo must not move a selection the reader made on purpose. It only steps in
 * when there is nothing to step on.
 */
function caretIsInside(doc: HTMLElement): boolean {
  const anchor = window.getSelection()?.anchorNode
  return anchor ? doc.contains(anchor) : false
}

function put(range: Range): void {
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * Blocks a caret cannot usefully sit at the end of.
 *
 * A locked clause refuses every change, the footnote list refuses a footnote,
 * and a rule, an image or a formula has no inside at all. Landing the caret in
 * one and then running a command produces a command that correctly declines
 * and a demo that looks broken.
 */
const NOT_A_LANDING = '[data-locked], [data-footnotes], [data-math], [data-columns], table'

/** A collapsed caret at the end of the document, so an insert has somewhere to land. */
function caretToEnd(doc: HTMLElement): void {
  const blocks = Array.from(doc.children).filter(
    (block) => !block.matches(NOT_A_LANDING) && block.textContent !== null,
  )
  const last = (blocks[blocks.length - 1] ?? doc.lastElementChild) as HTMLElement | null
  if (!last) return
  const range = document.createRange()
  range.selectNodeContents(last)
  range.collapse(false)
  put(range)
}

/**
 * Put the browser's selection on something worth formatting.
 *
 * The view listens for `selectionchange`, so a range set here arrives in the
 * editor's own state — which means a demo can say "select these words and press
 * bold" and then do both, rather than leaving a button that quietly does
 * nothing because nothing was selected.
 *
 * The named phrase is a preference, not a requirement: the document on screen
 * may be one the reader loaded or typed, and a demo that only works against the
 * shipped text is a demo that stops working the moment anyone uses the page.
 *
 * Failing that, the *first* block with words in it. First rather than last for
 * two reasons: it is usually a heading, so `clearFormatting` has something to
 * clear rather than declining on a bare paragraph, and it is on screen, so
 * whatever the demo does can be seen without scrolling to find it.
 */
function selectSomething(doc: HTMLElement, phrase?: string): boolean {
  if (phrase) {
    const walker = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT)
    let node = walker.nextNode()
    while (node) {
      const at = (node.textContent ?? '').indexOf(phrase)
      if (at !== -1) {
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + phrase.length)
        put(range)
        return true
      }
      node = walker.nextNode()
    }
  }

  const first = Array.from(doc.children).find((block) => (block.textContent ?? '').trim())
  if (!first) return false
  const range = document.createRange()
  range.selectNodeContents(first)
  put(range)
  return true
}

/**
 * A beat, so a selection set in the DOM has reached the editor.
 *
 * The view learns about a selection from the document's `selectionchange`
 * event, which is dispatched as a task rather than synchronously. Running the
 * command in the same turn as the range was set means running it against
 * whatever the selection was *before* — which on a page nobody has clicked into
 * is nothing at all, and every demo came back with nothing to do.
 */
const settled = () => new Promise((resolve) => window.setTimeout(resolve, 20))

/** Run one extension's demo, and say whether there was anything to run. */
export async function runDemo(
  name: string,
  getEditor: () => AnyEditor | null,
  doc: HTMLElement,
  parse: (html: string) => unknown[] | null,
): Promise<boolean> {
  const demo = DEMOS[name]
  if (!demo) return false

  if (demo.html) {
    // Parsed to nodes first. `insert` with a string types the string, so the
    // first version of this dropped a line of raw HTML into the document and
    // reported success.
    const nodes = parse(demo.html)
    if (!nodes?.length) return false
    // At the end, not at the caret: a demo that lands in the middle of the
    // sentence you were reading is a demo that ruins the page it is explaining.
    doc.focus()
    caretToEnd(doc)
    await settled()
    const editor = getEditor()
    if (!editor) return false
    const ok = editor.commands.insert?.(nodes) ?? false
    editor.commands.focus?.()
    return ok
  }

  if (demo.run) {
    // A command with nothing under it does nothing. Marks want a selection;
    // everything else just wants a caret.
    doc.focus()
    if (demo.select) selectSomething(doc, demo.select)
    else if (!caretIsInside(doc)) caretToEnd(doc)
    await settled()
    const editor = getEditor()
    if (!editor) return false
    const ok = editor.commands[demo.run.cmd]?.(...(demo.run.args ?? [])) ?? false
    editor.commands.focus?.()
    return ok
  }

  return false
}

// --- the guide ---------------------------------------------------------------

/*
  Redrawn only when the selection changes, not on every keystroke.

  This list is rebuilt from scratch, so redrawing it on `change` would throw
  away the row you were reaching for between the mouse going down and the click
  landing — and it would do it on every letter typed.
*/
let drawn = ''

function guide(host: RailHost, recent: string[], editor: AnyEditor | null): void {
  const list = $(host.root, '#pg-guide-list')
  const empty = $(host.root, '#pg-guide-empty')
  if (!list) return

  const shown = recent.filter((name) => DEMOS[name])
  const key = shown.join(',')
  if (key === drawn && list.childElementCount) return
  drawn = key
  list.replaceChildren()
  if (empty) empty.hidden = shown.length > 0

  for (const name of shown) {
    const demo = DEMOS[name] as Demo
    const row = document.createElement('li')
    row.className = 'pg-guide-row'
    row.dataset.for = name

    const head = document.createElement('div')
    head.className = 'pg-guide-head'
    const label = document.createElement('span')
    label.className = 'mono pg-guide-name'
    label.textContent = name
    head.append(label)

    if (demo.where && demo.where !== 'doc') {
      const where = document.createElement('span')
      where.className = 'pg-guide-where'
      where.textContent = { rail: 'margin', menu: 'menu', margin: 'margin', keys: 'keys' }[
        demo.where
      ] as string
      head.append(where)
    }

    const line = document.createElement('p')
    line.className = 'pg-guide-try'
    line.textContent = demo.try

    row.append(head, line)

    if (demo.html || demo.run) {
      const go = document.createElement('button')
      go.type = 'button'
      go.className = 'btn ghost small'
      go.textContent = 'Show me'
      go.addEventListener('mousedown', async (event) => {
        event.preventDefault()
        const ok = await runDemo(name, host.editor, host.doc, host.parse)
        go.textContent = ok ? 'Done' : 'Not here'
        window.setTimeout(() => {
          go.textContent = 'Show me'
        }, 1600)
      })
      row.append(go)
    }

    list.append(row)
  }
}

// --- outline -----------------------------------------------------------------

function outline(host: RailHost, on: boolean, editor: AnyEditor | null): void {
  const panel = $(host.root, '#pg-outline')
  const list = $(host.root, '#pg-outline-list')
  if (!panel || !list) return
  panel.hidden = !on
  if (!on || !editor) return

  let entries: { level: number; text: string; pos?: number; id?: string }[] = []
  try {
    entries = tableOfContents(editor.getJSON())
  } catch {
    entries = []
  }

  // Same reason as the guide: no redraw unless the outline actually moved.
  const key = entries.map((entry) => `${entry.level}:${entry.text}`).join('|')
  if (key === list.dataset.drawn && list.childElementCount) return
  list.dataset.drawn = key

  list.replaceChildren()
  if (!entries.length) {
    const none = document.createElement('p')
    none.className = 'pg-panel-empty'
    none.textContent = 'No headings yet · make one and it appears here.'
    list.append(none)
    return
  }

  for (const entry of entries) {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'pg-outline-row'
    row.dataset.level = String(entry.level)
    row.textContent = entry.text || 'Untitled'
    row.addEventListener('mousedown', (event) => {
      event.preventDefault()
      editor.commands.select?.(entry.pos as never)
      editor.commands.focus?.()
    })
    list.append(row)
  }
}

// --- counts ------------------------------------------------------------------

function counts(host: RailHost, on: boolean, editor: AnyEditor | null): void {
  const panel = $(host.root, '#pg-count-panel')
  if (!panel) return
  panel.hidden = !on
  if (!on || !editor) return
  const state = editor.extensionState<{ characters: number; words: number }>('characterCount')
  const words = $(host.root, '#pg-words')
  const chars = $(host.root, '#pg-chars')
  if (words) words.textContent = String(state?.words ?? 0)
  if (chars) chars.textContent = String(state?.characters ?? 0)
}

// --- autosave ----------------------------------------------------------------

function saved(host: RailHost, on: boolean, editor: AnyEditor | null): void {
  const panel = $(host.root, '#pg-saved-panel')
  if (!panel) return
  panel.hidden = !on
  if (!on || !editor) return
  const state = editor.extensionState<{
    dirty: boolean
    saving: boolean
    savedAt: number | null
  }>('autosave')
  const line = $(host.root, '#pg-saved')
  if (!line) return
  if (!state) line.textContent = '—'
  else if (state.saving) line.textContent = 'Saving…'
  else if (state.dirty) line.textContent = 'Unsaved changes'
  else if (state.savedAt)
    line.textContent = `Saved ${Math.max(0, Math.round((Date.now() - state.savedAt) / 1000))}s ago`
  else line.textContent = 'Nothing to save yet'
}

// --- find and replace --------------------------------------------------------

function find(host: RailHost, on: boolean, editor: AnyEditor | null): void {
  const panel = $(host.root, '#pg-find-panel')
  if (!panel) return
  panel.hidden = !on
  if (!on || !editor) return
  const state = editor.extensionState<{ matches: unknown[]; current: number }>('search')
  const tally = $(host.root, '#pg-find-count')
  if (tally) {
    const total = state?.matches.length ?? 0
    tally.textContent = total ? `${(state?.current ?? 0) + 1} of ${total}` : 'no matches'
  }
}

/**
 * Bound once. The inputs live in the markup, so they survive every rebuild —
 * only what they act on changes.
 */
export function bindRail(host: RailHost, getEditor: () => AnyEditor | null): void {
  if (host.root.dataset.bound === 'yes') return
  host.root.dataset.bound = 'yes'

  const query = $<HTMLInputElement>(host.root, '#pg-find-query')
  const replacement = $<HTMLInputElement>(host.root, '#pg-find-replace')

  const search = () => {
    getEditor()?.commands.setSearch?.({ query: query?.value ?? '' })
    find(host, true, getEditor())
  }

  query?.addEventListener('input', search)

  for (const [id, run] of [
    ['#pg-find-next', 'nextMatch'],
    ['#pg-find-prev', 'previousMatch'],
  ] as const) {
    $(host.root, id)?.addEventListener('mousedown', (event) => {
      event.preventDefault()
      getEditor()?.commands[run]?.()
      find(host, true, getEditor())
    })
  }

  $(host.root, '#pg-find-swap')?.addEventListener('mousedown', (event) => {
    event.preventDefault()
    getEditor()?.commands.replaceMatch?.(replacement?.value ?? '')
    find(host, true, getEditor())
  })

  $(host.root, '#pg-find-swap-all')?.addEventListener('mousedown', (event) => {
    event.preventDefault()
    getEditor()?.commands.replaceAllMatches?.(replacement?.value ?? '')
    find(host, true, getEditor())
  })
}

/** Redraw every panel · cheap enough to run on each change. */
export function renderRail(
  host: RailHost,
  names: string[],
  recent: string[],
  editor: AnyEditor | null,
): void {
  const has = (name: string) => names.includes(name)
  guide(host, recent, editor)
  outline(host, has('tableOfContents'), editor)
  counts(host, has('characterCount'), editor)
  saved(host, has('autosave'), editor)
  find(host, has('search'), editor)
}
