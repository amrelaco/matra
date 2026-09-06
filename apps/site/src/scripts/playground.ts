/**
 * The playground: an editor you assemble by ticking boxes.
 *
 * The page it lives on makes one claim — the extension array *is* the feature
 * list — and this is the file that makes the claim operable. Tick `heading`
 * and the editor under the cursor grows headings; untick it and Enter stops
 * making them. Nothing is simulated: every toggle destroys the editor and
 * builds a real one from the real array, which is also why the rebuild time
 * on screen is worth reading. It is the product doing the work, timed.
 *
 * Three things are measured rather than asserted:
 *
 *   - size, from `scripts/extension-sizes.mjs`, which bundles each extension
 *     with esbuild and gzips it;
 *   - rebuild time, from `performance.now()` around `createEditor` and mount;
 *   - the import line, generated from the selection so it is never stale.
 */
import type * as Core from '@matrajs/core'
import catalogue from '../data/playground.json'

type Def = Parameters<typeof Core.createEditor>[0]['extensions'][number]
type AnyEditor = ReturnType<typeof Core.createEditor>

/**
 * Loaded on demand, and that is not a nicety.
 *
 * This page imports every extension there is. Imported statically, Rollup
 * hoists the whole of core into the chunk every page shares — the landing page
 * measured 54 kB before this file existed and 75 kB after, which on a site
 * whose argument is bundle size would be an own goal. A dynamic import keeps
 * the catalogue in a chunk only this page asks for.
 */
let core: typeof import('./playground-registry')

/** Always present. An editor without these has nowhere to put a character. */
const FLOOR = ['document', 'paragraph', 'text']

/**
 * What a schema needs that the writer did not ask for.
 *
 * A list without its item is not a smaller list, it is a schema error. Ticking
 * the parent brings the parts rather than letting the editor throw, and the
 * parts appear ticked so the array on screen stays the truth.
 */
const REQUIRES: Record<string, string[]> = {
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
}

/**
 * The eight extensions that are functions needing an argument.
 *
 * These are the defaults the playground picks so the box can be ticked at all.
 * The docs give the real options; what matters here is that the extension is
 * genuinely running, not that its configuration is interesting.
 */
const CONFIGURED: Record<string, () => unknown> = {
  placeholder: () => core.CONFIGURE.placeholder({ text: 'Tick something on the left.' }),
  autosave: () => core.CONFIGURE.autosave({ save: () => {} }),
  suggestion: () => core.CONFIGURE.suggestion({ char: '/' }),
  ghostText: () => core.CONFIGURE.ghostText({ suggest: () => null }),
  tableOfContents: () => core.CONFIGURE.tableOfContents({ onUpdate: () => {} }),
  bubbleMenu: () => core.CONFIGURE.bubbleMenu({ element: floatingHost('bubble') }),
  floatingMenu: () => core.CONFIGURE.floatingMenu({ element: floatingHost('floating') }),
  snippets: () => core.CONFIGURE.snippets([{ trigger: 'sig', content: 'Sent from Matra' }]),
}

/** Extensions that ship a stylesheet, so ticking one also looks right. */
const STYLES: Record<string, string> = {
  callout: 'calloutCSS',
  codeHighlight: 'codeHighlightCSS',
  columnList: 'columnsCSS',
  comment: 'commentCSS',
  details: 'detailsCSS',
  dictation: 'dictationCSS',
  dragHandle: 'dragHandleCSS',
  embed: 'embedCSS',
  field: 'fieldsCSS',
  footnotes: 'footnotesCSS',
  ghostText: 'ghostTextCSS',
  imageResize: 'imageResizeCSS',
  invisibleCharacters: 'invisibleCharactersCSS',
  locked: 'lockedCSS',
  mathBlock: 'mathCSS',
  mathInline: 'mathCSS',
  pageBreak: 'pageBreakCSS',
  placeholder: 'placeholderCSS',
  search: 'searchCSS',
  selectionHighlight: 'selectionHighlightCSS',
  suggestion: 'suggestionCSS',
  taskList: 'taskListCSS',
  youtube: 'youtubeCSS',
}

const SIZES = new Map<string, number>(
  catalogue.groups.flatMap((g) => g.items.map((i) => [i.name, i.gz] as [string, number])),
)

/** A preset worth arriving on: enough to type into, small enough to read. */
const DEFAULT = ['bold', 'italic', 'link', 'heading', 'bulletList', 'listItem', 'placeholder']

const selected = new Set<string>()
let editor: AnyEditor | null = null

const $ = <T extends HTMLElement>(sel: string): T | null =>
  window.document.querySelector<T>(sel)

function floatingHost(id: string): HTMLElement {
  const existing = window.document.getElementById(`pg-${id}`)
  if (existing) return existing
  const host = window.document.createElement('div')
  host.id = `pg-${id}`
  host.hidden = true
  window.document.body.appendChild(host)
  return host
}

/** Close the selection over what each ticked extension cannot work without. */
function withRequirements(names: Iterable<string>): string[] {
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

function instantiate(name: string): Def | Def[] | null {
  const configured = CONFIGURED[name]
  if (configured) return configured() as Def | Def[]
  const value = core.REGISTRY[name]
  if (value === undefined) return null
  return typeof value === 'function' ? ((value as () => Def)() as Def) : (value as Def)
}

function styleSheetFor(names: string[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const name of names) {
    const key = STYLES[name]
    if (!key || seen.has(key)) continue
    seen.add(key)
    const css = core.SHEETS[key]
    if (typeof css === 'string') parts.push(css)
  }
  return parts.join('\n')
}

/**
 * Rebuild, and report what it cost.
 *
 * The old editor is destroyed rather than updated, because that is the honest
 * comparison: this is what an application pays to mount Matra from nothing.
 */
function rebuild(): void {
  const host = $('#pg-editor')
  const status = $('#pg-status')
  if (!host) return

  const names = withRequirements(selected)
  const active = [...FLOOR, ...names]

  const defs: Def[] = []
  const failed: string[] = []
  for (const name of active) {
    try {
      const made = instantiate(name)
      if (Array.isArray(made)) defs.push(...made)
      else if (made) defs.push(made)
    } catch {
      failed.push(name)
    }
  }

  editor?.destroy()
  host.innerHTML = ''

  const sheet = $('#pg-sheet')
  if (sheet) sheet.textContent = styleSheetFor(active)

  const started = performance.now()
  try {
    const made = core.createEditor({
      extensions: defs as never,
      content: '<p>This editor was built from the boxes on the left.</p>',
    })
    made.mount(host)
    editor = made
  } catch (error) {
    editor = null
    if (status) {
      status.textContent =
        error instanceof Error
          ? `That array will not build: ${error.message}`
          : 'That array will not build.'
      status.hidden = false
    }
    paint(names, null, failed)
    return
  }
  const elapsed = performance.now() - started

  if (status) status.hidden = true
  paint(names, elapsed, failed)
}

function paint(names: string[], elapsed: number | null, failed: string[]): void {
  const summed = names.reduce((n, name) => n + (SIZES.get(name) ?? 0), 0)

  const size = $('#pg-size')
  if (size) {
    size.textContent = (catalogue.floorGz + summed).toFixed(1)
    size.classList.remove('ticked')
    // Reflow, so the same class re-triggers on a second identical change.
    void size.offsetWidth
    size.classList.add('ticked')
  }

  const count = $('#pg-count')
  if (count) count.textContent = String(names.length)

  const time = $('#pg-time')
  if (time) time.textContent = elapsed === null ? '—' : elapsed.toFixed(1)

  const code = $('#pg-code')
  if (code) code.textContent = importLine(names)

  const note = $('#pg-failed')
  if (note) {
    note.hidden = failed.length === 0
    if (failed.length) note.textContent = `Could not build: ${failed.join(', ')}.`
  }

  for (const box of Array.from(
    window.document.querySelectorAll<HTMLInputElement>('input[data-ext]'),
  )) {
    const name = box.dataset.ext ?? ''
    const on = names.includes(name)
    box.checked = on
    // A part pulled in by its parent is ticked but not chosen; saying so is
    // better than letting the reader think they ticked it.
    box.closest('label')?.classList.toggle('implied', on && !selected.has(name))
  }

  writeHash(names)
}

function importLine(names: string[]): string {
  const imported = [...new Set(['createEditor', ...FLOOR, ...names])].sort((a, b) =>
    a === 'createEditor' ? -1 : b === 'createEditor' ? 1 : a.localeCompare(b),
  )
  const list = imported.join(', ')
  const array = [...FLOOR, ...names].map((n) => (CONFIGURED[n] ? `${n}({ … })` : n)).join(', ')
  return `import { ${list} } from '@matrajs/core'\n\nconst editor = createEditor({\n  extensions: [${array}],\n})`
}

/** The selection lives in the URL, so a configuration can be sent to someone. */
function writeHash(names: string[]): void {
  const chosen = [...selected].sort()
  const next = chosen.length ? `#${chosen.join(',')}` : ' '
  window.history.replaceState(null, '', next)
}

function readHash(): string[] {
  const raw = window.location.hash.replace(/^#/, '')
  if (!raw) return DEFAULT
  const known = new Set(SIZES.keys())
  const names = raw.split(',').filter((n) => known.has(n))
  return names.length ? names : DEFAULT
}

async function start(): Promise<void> {
  const host = $('#pg-editor')
  if (!host) return

  if (!core) core = await import('./playground-registry')

  selected.clear()
  for (const name of readHash()) selected.add(name)

  for (const box of Array.from(
    window.document.querySelectorAll<HTMLInputElement>('input[data-ext]'),
  )) {
    box.addEventListener('change', () => {
      const name = box.dataset.ext ?? ''
      if (box.checked) selected.add(name)
      else selected.delete(name)
      rebuild()
    })
  }

  $('#pg-clear')?.addEventListener('click', () => {
    selected.clear()
    rebuild()
  })

  $('#pg-starter')?.addEventListener('click', () => {
    selected.clear()
    for (const name of DEFAULT) selected.add(name)
    rebuild()
  })

  const copy = $<HTMLButtonElement>('#pg-copy')
  copy?.addEventListener('click', async () => {
    const code = $('#pg-code')?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(code)
      copy.textContent = 'Copied'
      window.setTimeout(() => {
        copy.textContent = 'Copy'
      }, 1400)
    } catch {
      copy.textContent = 'Press Cmd-C'
    }
  })

  rebuild()
}

void start()
window.document.addEventListener('astro:page-load', () => {
  void start()
})
