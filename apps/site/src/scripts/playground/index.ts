import { DEMOS, SHOWCASE } from '../../data/playground-demos'
import { modeById } from '../../data/playground-modes'
/**
 * The playground: an editor you assemble by ticking boxes.
 *
 * The page makes one claim — the extension array *is* the feature list — and
 * this is the file that makes the claim operable. Tick `heading` and the editor
 * under the cursor grows headings; untick it and Enter stops making them.
 * Nothing is simulated: every toggle destroys the editor and builds a real one
 * from the real array, which is also why the rebuild time on screen is worth
 * reading. It is the product doing the work, timed.
 *
 * Three things are measured rather than asserted:
 *
 *   - size, from `scripts/extension-sizes.mjs`, which bundles each extension
 *     with esbuild and gzips it;
 *   - rebuild time, from `performance.now()` around `createEditor` and mount;
 *   - the import line, generated from the selection so it is never stale.
 *
 * And two things are shown rather than described: every extension carries a
 * demo the margin will run for you, and the whole interface has four skins, so
 * "headless" is something you can watch rather than a word on the landing page.
 */
import catalogue from '../../data/playground.json'
import { renderMath } from '../math'
import { watchSlash } from '../slash'
import { attachComments, focusThread, render as renderComments, startThread } from './comments'
import { closeMentions, watchMentions } from './mentions'
import { paintSwatches } from './palette'
import { bindRail, renderRail, runDemo } from './rail'
import {
  DEFAULT_SELECTION,
  FLOOR,
  initialMode,
  initialSelection,
  remember,
  rememberMode,
  withRequirements,
} from './state'
import { bindTools, paintTools, syncTools } from './tools'

type AnyEditor = {
  commands: Record<string, ((...args: unknown[]) => boolean) | undefined>
  isActive: (name: string, attrs?: Record<string, unknown>) => boolean
  extensionState: <S>(name: string) => S | undefined
  getJSON: () => unknown
  getHTML: () => string
  getText: () => string
  selection: { empty: boolean; from: number; to: number }
  mount: (element: HTMLElement) => void
  destroy: () => void
  on: (event: string, fn: () => void) => () => void
}

/**
 * Loaded on demand, and that is not a nicety.
 *
 * This page imports every extension there is. Imported statically, Rollup
 * hoists the whole of core into the chunk every page shares — the landing page
 * measured 54 kB before this file existed and 75 kB after, which on a site
 * whose argument is bundle size would be an own goal. A dynamic import keeps
 * the catalogue in a chunk only this page asks for.
 */
let core: typeof import('./registry')

const SIZES = new Map<string, number>(
  catalogue.groups.flatMap((group) =>
    group.items.map((item) => [item.name, item.gz] as [string, number]),
  ),
)
const ALL = [...SIZES.keys()]

/** Extensions that ship a stylesheet, so ticking one also looks right. */
const STYLES: Record<string, string> = {
  blockColor: 'blockColorCSS',
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

const selected = new Set<string>()
/**
 * The last few ticked, newest first.
 *
 * The margin used to list everything ticked, which on "Show everything" was
 * seventy-six rows repeating seventy-six chips. The demo lives on the chip now;
 * this is the one thing the picker cannot show — what you just did.
 */
const recent: string[] = []
const RECENT = 4

function remember_recent(name: string): void {
  const at = recent.indexOf(name)
  if (at !== -1) recent.splice(at, 1)
  recent.unshift(name)
  recent.length = Math.min(recent.length, RECENT)
}

let mode = 'paper'
let editor: AnyEditor | null = null
/**
 * The array the live editor was built from.
 *
 * Kept so demo markup can be parsed against the same schema the document is
 * using: a demo that inserts a callout into an editor with no callout should
 * come back with nothing rather than with the callout's text loose in a
 * paragraph.
 */
let built: unknown[] = []
/**
 * The element the live editor is mounted on.
 *
 * This module is evaluated once and survives client-side navigation, but the
 * DOM does not: leaving the page and coming back swaps in a fresh element while
 * `editor` still points at the old, detached one. Reading its HTML then carries
 * a document from a page that no longer exists onto an element it was never
 * mounted on, and the panel comes up blank.
 */
let mountedOn: HTMLElement | null = null
/** The document the page shipped with, kept so Clear has something to go back to. */
let seed = ''

const $ = <T extends HTMLElement>(sel: string): T | null =>
  window.document.querySelector<T>(sel)

const getEditor = () => editor

/**
 * A line under the toolbar, for the two things that used to be browser modals.
 *
 * `window.alert` blocks the page and takes the selection with it, which on a
 * page whose whole subject is the selection is the worst possible choice.
 */
let noteTimer = 0
function note(text: string): void {
  const line = $('#pg-note')
  if (!line) return
  line.textContent = text
  line.hidden = false
  window.clearTimeout(noteTimer)
  noteTimer = window.setTimeout(() => {
    line.hidden = true
  }, 3200)
}

/**
 * Asking for a link address without leaving the document.
 *
 * The selection is captured on the way in and restored on the way out: focus
 * moves to the input, the editor's own selection collapses behind it, and a
 * command run afterwards would otherwise land on a caret somewhere else. That
 * is the bug `window.prompt` had too, with a modal on top of it.
 */
let linkRange: { from: number; to: number } | null = null

function hideLinkBar(): void {
  const bar = $('#pg-linkbar')
  if (bar) bar.hidden = true
  linkRange = null
}

function showLinkBar(target: AnyEditor): void {
  const bar = $('#pg-linkbar')
  const input = $<HTMLInputElement>('#pg-linkbar-input')
  const scroll = $('#pg-scroll')
  if (!bar || !input || !scroll) return
  if (target.selection.empty) {
    note('Select the words the link should sit on first.')
    return
  }

  linkRange = {
    from: target.selection.from as unknown as number,
    to: target.selection.to as unknown as number,
  }

  const range = window.getSelection()?.rangeCount
    ? window.getSelection()?.getRangeAt(0).getBoundingClientRect()
    : null
  const base = scroll.getBoundingClientRect()
  bar.hidden = false
  if (range) {
    bar.style.left = `${Math.max(8, Math.round(range.left - base.left + scroll.scrollLeft))}px`
    bar.style.top = `${Math.round(range.bottom - base.top + scroll.scrollTop + 8)}px`
  }
  input.value = ''
  input.focus()
}

/*
  The block palette.

  Positioned like the link bar and dismissed like it, but it needs no
  selection: block colour applies to whatever block the caret is in, which is
  the whole reason it is not a mark. A caret inside a paragraph is enough.
*/
function hidePalette(): void {
  const palette = $('#pg-palette')
  if (palette) palette.hidden = true
}

function showPalette(target: AnyEditor): void {
  const palette = $('#pg-palette')
  const scroll = $('#pg-scroll')
  if (!palette || !scroll) return
  void target

  const range = window.getSelection()?.rangeCount
    ? window.getSelection()?.getRangeAt(0).getBoundingClientRect()
    : null
  const base = scroll.getBoundingClientRect()
  palette.hidden = false
  if (range) {
    palette.style.left = `${Math.max(8, Math.round(range.left - base.left + scroll.scrollLeft))}px`
    palette.style.top = `${Math.round(range.bottom - base.top + scroll.scrollTop + 8)}px`
  }
}

/**
 * Apply one swatch.
 *
 * The value rides on the button, so this stays a lookup-free handler: read the
 * attribute, pick the command by which row it came from, pass it on. A swatch
 * with no `data-color` is the clear.
 */
function applySwatch(button: HTMLElement): void {
  if (!editor) return
  const commands = editor.commands as Record<string, ((value?: unknown) => boolean) | undefined>
  const color = button.dataset.color
  const text = button.dataset.kind === 'text'
  const set = text ? commands.setBlockColor : commands.setBlockBackground
  const clear = text ? commands.unsetBlockColor : commands.unsetBlockBackground
  const done = color ? set?.(color) : clear?.()
  if (done === false && color) {
    note('That colour was refused · the value has to be a colour and nothing else.')
  }
  editor.commands.focus?.()
}

function applyLink(): void {
  const input = $<HTMLInputElement>('#pg-linkbar-input')
  const href = input?.value.trim()
  const range = linkRange
  hideLinkBar()
  if (!href || !range || !editor) return
  editor.commands.select?.(range as never)
  // `{ href }`, not `href`. The command takes the attributes, and a bare string
  // sailed through as an object with no href at all.
  const ok = editor.commands.setLink?.({ href })
  editor.commands.focus?.()
  if (!ok) note('That address was refused · links must be http, https or mailto.')
}

/**
 * The extensions that take an argument, with the argument this page gives them.
 *
 * `code` is not decoration. The drawer below the editor has to show something
 * that would compile, and `bubbleMenu` written as a bare name would not — so
 * every configured extension says how it should be written down.
 */
interface Configured {
  make: () => unknown
  /** How it should be written down · the drawer has to show something real. */
  code: () => string
  /** What to import for it, when that is not its own name. */
  imports?: string[]
}

const menuHost = (id: string): HTMLElement => {
  const found = window.document.getElementById(id)
  if (found) return found
  // Only reachable if the markup changed underneath this file; a detached host
  // is better than a thrown error taking the whole editor down with it.
  const host = window.document.createElement('div')
  host.id = id
  host.hidden = true
  window.document.body.appendChild(host)
  return host
}

/**
 * A stand-in for a completion model.
 *
 * Canned, and deliberately so: the extension's job is to ask, wait and draw,
 * and pointing it at a real model would demonstrate the model. Two sentences of
 * plausible continuation is enough to see Tab take it.
 */
const GHOSTS = [
  ' — and the array underneath it never moved.',
  ' which is the part that is hard to believe until you watch it.',
  ' so the interface and the document stay two separate problems.',
]

const CONFIGURED: Record<string, Configured> = {
  placeholder: {
    make: () => core.CONFIGURE.placeholder({ text: 'Write something, or press / for a menu.' }),
    code: () => "placeholder({ text: '…' })",
  },
  autosave: {
    make: () => core.CONFIGURE.autosave({ save: () => {}, delay: 600 }),
    code: () => 'autosave({ save })',
  },
  /*
    One `suggestion` per trigger.

    The extension finds a character, tracks what is typed after it and marks the
    range; it renders nothing, which is why the menus on this page are ours. The
    second instance only exists while `mention` is ticked, because an @ menu
    with nothing to insert is a menu that does nothing.
  */
  suggestion: {
    make: () => {
      const slash = core.CONFIGURE.suggestion({ char: '/', name: 'slash' })
      if (!selected.has('mention')) return [slash]

      /*
        The second instance gives up its commands, and that is a workaround.

        `suggestion` documents that two of them on one editor need two names,
        and two of them do work — separate state, separate decorations. What
        does not work is the pair of commands they both declare:
        `acceptSuggestion` and `cancelSuggestion` are not namespaced by the
        extension's name, so the second instance trips the "two extensions both
        define this command" guard and the whole editor refuses to build.

        Dropping the duplicates leaves the first instance's pair standing, which
        is the right answer anyway — only one suggestion can be open at a time.
        The proper fix belongs in core, either by namespacing those two names or
        by letting the generic pair act on whichever suggestion is active.
      */
      const at = core.CONFIGURE.suggestion({ char: '@', name: 'mention' }) as {
        commands?: Record<string, unknown>
      }
      const { acceptSuggestion: _a, cancelSuggestion: _c, ...rest } = at.commands ?? {}
      return [slash, { ...at, commands: rest }]
    },
    code: () =>
      selected.has('mention')
        ? "suggestion({ char: '/', name: 'slash' }), suggestion({ char: '@', name: 'mention' })"
        : "suggestion({ char: '/', name: 'slash' })",
  },
  ghostText: {
    make: () =>
      core.CONFIGURE.ghostText({
        delay: 400,
        /*
          Never propose what is already there.

          Keyed only on length, this offered the same sentence again the moment
          you accepted it — Tab, Tab, Tab and the paragraph filled with three
          copies of the same clause. A real completion model would not do that,
          so neither should the stand-in for one.
        */
        suggest: ({ before }: { before: string }) => {
          const text = before.trimEnd()
          if (text.length < 12) return null
          const fresh = GHOSTS.filter((phrase) => !before.includes(phrase.trim()))
          return fresh.length ? (fresh[text.length % fresh.length] as string) : null
        },
      }),
    code: () => 'ghostText({ suggest })',
  },
  bubbleMenu: {
    make: () => core.CONFIGURE.bubbleMenu({ element: menuHost('pg-bubble') }),
    code: () => 'bubbleMenu({ element })',
  },
  /*
    `start`, not `left`.

    Notion puts a plus in the margin because a plus is one glyph wide. This menu
    is twelve buttons, and asked to sit in the margin it ran off the left of the
    pane and was clamped to x=0 — a menu in the gutter, pointing at nothing. On
    the line is the right place for it: the line is empty, so there is nothing
    to cover, and the first character typed takes it away again.
  */
  /*
    A single plus, in the margin.

    `start` put it exactly where the next character goes, which is precise and
    wrong: clicking the empty line to type there hits the button instead. The
    margin is the only place it can sit without being in the way, and the
    offset clears the drag handle, which takes the 28 pixels nearest the text.
  */
  floatingMenu: {
    make: () =>
      core.CONFIGURE.floatingMenu({
        element: menuHost('pg-floating'),
        placement: 'left',
        offset: 32,
      }),
    code: () => 'floatingMenu({ element })',
  },
  /*
    Footnotes arrive as a kit or not at all · see the note in registry.ts. The
    three nodes are ticked together by REQUIRES, so the kit hangs off one of
    them and the other two contribute nothing rather than a second copy of the
    same node names.
  */
  footnotes: {
    make: () => core.CONFIGURE.footnotesKit(),
    code: () => '...footnotesKit()',
    imports: ['footnotesKit'],
  },
  footnote: { make: () => [], code: () => '', imports: [] },
  footnoteRef: { make: () => [], code: () => '', imports: [] },
  /*
    Both maths nodes get a renderer, because without one they show their source
    in a `<code>` — correct for a headless extension, and indistinguishable from
    broken next to a caption saying "rendered where it stands". `renderMath` is
    the site's own hundred-and-fifty-line LaTeX-to-MathML converter: no
    dependency, and a demonstration that plugging a renderer in is one function.
  */
  mathInline: {
    make: () => core.REGISTRY_FACTORY.mathInline({ render: renderMath }),
    code: () => 'mathInline({ render })',
  },
  mathBlock: {
    make: () => core.REGISTRY_FACTORY.mathBlock({ render: renderMath }),
    code: () => 'mathBlock({ render })',
  },
  snippets: {
    make: () => core.CONFIGURE.snippets([{ trigger: 'sig', content: '— Nahim, Matra' }]),
    code: () => "snippets([{ trigger: 'sig', … }])",
  },
}

function instantiate(name: string): unknown[] {
  const configured = CONFIGURED[name]
  if (configured) {
    const made = configured.make()
    return Array.isArray(made) ? made : [made]
  }
  const value = core.REGISTRY[name]
  if (value === undefined) return []
  const made = typeof value === 'function' ? (value as () => unknown)() : value
  return Array.isArray(made) ? made : [made]
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

// --- the rebuild -------------------------------------------------------------

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

  const defs: unknown[] = []
  const failed: string[] = []
  for (const name of active) {
    try {
      defs.push(...instantiate(name))
    } catch {
      failed.push(name)
    }
  }
  built = defs

  /*
    Carry the document across the rebuild rather than resetting it. Losing what
    you typed every time you tick a box would make the page unusable — and when
    unticking an extension drops the nodes it owned, watching that happen is the
    clearest possible demonstration of what the array controls.

    Read before destroying, and only when the editor belongs to the element in
    front of us: after a client-side navigation it points at a detached one.
  */
  const live = editor !== null && mountedOn === host
  const carried = live ? (editor as AnyEditor).getHTML() : seed

  if (live) (editor as AnyEditor).destroy()
  editor = null
  mountedOn = null
  closeMentions()
  host.innerHTML = ''

  const sheet = $('#pg-sheet')
  if (sheet) sheet.textContent = styleSheetFor(active)

  const started = performance.now()
  try {
    const made = core.createEditor({
      extensions: defs as never,
      content: carried,
    }) as unknown as AnyEditor
    made.mount(host)
    editor = made
    mountedOn = host
    if (names.includes('suggestion')) {
      watchSlash(made as never)
      if (names.includes('mention')) watchMentions(made as never)
    }
    // The interface has to follow the caret, not just the rebuild.
    made.on('change', afterChange)
    made.on('selectionChange', afterChange)
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
  wire(names)
}

/** Everything that has to be true again after the document or the caret moved. */
/**
 * Markup → the nodes this schema can hold.
 *
 * A throwaway editor with the same extensions, asked for its JSON and then
 * destroyed. It costs a millisecond and it is the only reading of the markup
 * that can be trusted: anything the ticked extensions cannot represent is
 * dropped here rather than arriving as loose text in the document.
 */
function parseHTML(html: string): unknown[] | null {
  try {
    const scratch = core.createEditor({
      extensions: built as never,
      content: html,
    }) as unknown as AnyEditor
    const json = scratch.getJSON() as { content?: unknown[] }
    scratch.destroy()
    return json.content ?? null
  } catch {
    return null
  }
}

function afterChange(): void {
  const bar = $('#pg-bar')
  const bubble = $('#pg-bubble')
  if (bar) paintTools(bar, editor)
  if (bubble) paintTools(bubble, editor)
  renderComments()
  const rail = $('#pg-rail')
  const doc = $('#pg-editor')
  if (rail && doc)
    renderRail(
      { root: rail, doc, parse: parseHTML, editor: getEditor },
      withRequirements(selected),
      recent,
      editor,
    )
}

/** Show the commands this editor has, and hand the margin the same list. */
function wire(names: string[]): void {
  const bar = $('#pg-bar')
  const bubble = $('#pg-bubble')
  const floating = $('#pg-floating')
  // The plus itself carries no command, so `syncTools` has nothing to say
  // about it · the strip it opens is `#pg-blocks`.

  const rail = $('#pg-rail')
  const doc = $('#pg-editor')
  const margin = $('#pg-margin')

  const shown = bar ? syncTools(bar, editor) : 0
  if (bubble) syncTools(bubble, editor)
  if (floating) syncTools(floating, editor)
  const blocks = $('#pg-blocks')
  if (blocks) syncTools(blocks, editor)

  const empty = $('#pg-toolbar-empty')
  if (empty) empty.hidden = shown > 0

  if (margin && doc) {
    attachComments(editor as never, {
      margin,
      doc,
      onCount: (count) => {
        margin.dataset.count = String(count)
      },
    })
  }
  if (rail && doc)
    renderRail({ root: rail, doc, parse: parseHTML, editor: getEditor }, names, recent, editor)
}

// --- painting ----------------------------------------------------------------

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
  /*
    The floor counts. `document`, `paragraph` and `text` are in the array the
    drawer prints and in the 79 the rest of the site quotes, so a readout saying
    76 was disagreeing with the code directly underneath it. They carry no chip
    because they cannot be unticked, which is a reason to leave them out of the
    picker and not a reason to leave them out of the count.
  */
  if (count) count.textContent = String(FLOOR.length + names.length)

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

  remember([...selected])
}

function importLine(names: string[]): string {
  const all = [...FLOOR, ...names]
  const imported = [
    ...new Set(['createEditor', ...all.flatMap((name) => CONFIGURED[name]?.imports ?? [name])]),
  ].sort((a, b) => (a === 'createEditor' ? -1 : b === 'createEditor' ? 1 : a.localeCompare(b)))
  // An extension that contributes nothing of its own — a node its kit already
  // brings — writes itself as an empty string and is left out of the array.
  const array = all
    .map((name) => (CONFIGURED[name] ? CONFIGURED[name].code() : name))
    .filter((entry) => entry !== '')
    .join(', ')
  return `import { ${imported.join(', ')} } from '@matrajs/core'\n\nconst editor = createEditor({\n  extensions: [${array}],\n})`
}

// --- modes -------------------------------------------------------------------

/**
 * Put a skin on, and tick whatever that skin is a lie without.
 *
 * Only ever adds. A mode that could untick things would quietly undo a
 * selection you spent a minute building, and the point of the switch is to
 * show the same array under a different interface.
 */
function setMode(id: string, tick = true): void {
  mode = modeById(id).id
  const chosen = modeById(mode)
  rememberMode(mode)

  const bench = $('#pg-bench')
  if (bench) bench.dataset.mode = mode

  for (const button of Array.from(
    window.document.querySelectorAll<HTMLButtonElement>('.pg-mode'),
  )) {
    const on = button.dataset.mode === mode
    button.setAttribute('aria-checked', String(on))
    button.classList.toggle('on', on)
  }

  if (!tick) return
  let grew = false
  for (const name of chosen.needs) {
    if (SIZES.has(name) && !selected.has(name)) {
      selected.add(name)
      grew = true
    }
  }
  // The skins that draw menus need the extensions that position them.
  for (const [need, wanted] of [
    ['bubbleMenu', chosen.chrome.bubble],
    ['floatingMenu', chosen.chrome.handles],
  ] as const) {
    if (wanted && !selected.has(need)) {
      selected.add(need)
      grew = true
    }
  }
  if (grew) rebuild()
}

// --- the picker --------------------------------------------------------------

function filterCatalogue(query: string): void {
  const needle = query.trim().toLowerCase()
  let shown = 0
  for (const chip of Array.from(window.document.querySelectorAll<HTMLElement>('[data-chip]'))) {
    const name = chip.dataset.chip ?? ''
    const what = chip.dataset.what ?? ''
    const hit =
      !needle || name.toLowerCase().includes(needle) || what.toLowerCase().includes(needle)
    chip.hidden = !hit
    if (hit) shown += 1
  }
  for (const group of Array.from(
    window.document.querySelectorAll<HTMLElement>('[data-group]'),
  )) {
    group.hidden = group.querySelector('[data-chip]:not([hidden])') === null
  }
  const empty = $('#pg-filter-empty')
  if (empty) empty.hidden = shown > 0
}

function choose(names: string[], document?: string): void {
  selected.clear()
  recent.length = 0
  for (const name of names) selected.add(name)
  // Seeded so the margin has something to point at · reversed because
  // remember_recent unshifts, and the first of the preset should read first.
  for (const name of names.slice(0, RECENT).reverse()) remember_recent(name)
  if (document !== undefined && editor) {
    // Set before the rebuild so the new schema parses it, not the old one.
    seed = document
    editor.destroy()
    editor = null
    mountedOn = null
    const host = $('#pg-editor')
    if (host) host.innerHTML = ''
  }
  rebuild()
}

// --- start -------------------------------------------------------------------

async function start(): Promise<void> {
  const host = $('#pg-editor')
  if (!host) return

  if (!core) core = await import('./registry')

  /*
    Re-read the seed whenever the element is a fresh one.

    A served element holds the seed markup; one Matra has already mounted holds
    a document and carries its class. Keying off that rather than off a
    module-level flag means a return visit starts from the markup the page
    actually shipped.
  */
  if (host !== mountedOn) {
    seed = host.innerHTML
    editor = null
    mountedOn = null
  }

  /*
    Bound once per element, not once per start().

    start() runs at module load and again on astro:page-load, which both fire on
    a first visit. Two handlers on one button means toggleBold runs twice and
    the mark goes on and straight back off — a button that looks bound and does
    nothing.
  */
  /*
    The plus opens the block strip beside itself, and anything else closes it:
    a click elsewhere, Escape, or the caret leaving the empty line the plus was
    offered on — which the extension signals by hiding the plus.
  */
  const plus = $('#pg-plus')
  if (plus && plus.dataset.bound !== 'yes') {
    plus.dataset.bound = 'yes'
    plus.addEventListener('mousedown', (event) => {
      event.preventDefault()
      const strip = $('#pg-blocks')
      const anchor = $('#pg-floating')
      if (!strip || !anchor) return
      if (!strip.hidden) {
        strip.hidden = true
        return
      }
      strip.hidden = false
      // Beside the plus and one line down, so it covers the empty line it is
      // about rather than the paragraph above it.
      const left = Number.parseInt(anchor.style.left || '0', 10)
      const top = Number.parseInt(anchor.style.top || '0', 10)
      strip.style.left = `${left}px`
      strip.style.top = `${top + 28}px`
    })
    window.document.addEventListener('mousedown', (event) => {
      const strip = $('#pg-blocks')
      if (!strip || strip.hidden) return
      const target = event.target as Node | null
      if (target && (strip.contains(target) || plus.contains(target))) return
      strip.hidden = true
    })
    window.document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return
      const strip = $('#pg-blocks')
      if (strip) strip.hidden = true
    })
  }

  for (const id of ['#pg-bar', '#pg-bubble', '#pg-blocks']) {
    const strip = $(id)
    if (strip) {
      bindTools(strip, getEditor, {
        link: (target) => showLinkBar(target as never),
        blockColor: (target) => showPalette(target as never),
        comment: (target) => {
          if (!startThread(target as never)) {
            note('Select some words first · a comment has to point at something.')
          }
        },
      })
    }
  }

  /*
    The play button on every chip. Delegated rather than bound one by one: there
    are seventy-six of them and the filter hides and shows them constantly.
  */
  const side = $('.pg-side')
  if (side && side.dataset.demos !== 'yes') {
    side.dataset.demos = 'yes'
    side.addEventListener('mousedown', (event) => {
      const button = (event.target as HTMLElement | null)?.closest?.('[data-demo]')
      const name = (button as HTMLElement | null)?.dataset.demo
      if (!name) return
      // Both, or the label around it ticks the box on the way past.
      event.preventDefault()
      event.stopPropagation()
      const target = $('#pg-editor')
      if (!target) return
      if (!selected.has(name)) {
        selected.add(name)
        remember_recent(name)
        rebuild()
      }
      void runDemo(name, getEditor, target, parseHTML).then((ok) => {
        if (!ok) note(`${name} has nothing to run on its own · the margin says what to do.`)
      })
    })
  }

  const rail = $('#pg-rail')
  if (rail && host)
    bindRail({ root: rail, doc: host, parse: parseHTML, editor: getEditor }, getEditor)

  for (const box of Array.from(
    window.document.querySelectorAll<HTMLInputElement>('input[data-ext]'),
  )) {
    if (box.dataset.bound === 'yes') continue
    box.dataset.bound = 'yes'
    box.addEventListener('change', () => {
      const name = box.dataset.ext ?? ''
      if (box.checked) {
        selected.add(name)
        remember_recent(name)
      } else selected.delete(name)
      rebuild()
    })
  }

  for (const button of Array.from(
    window.document.querySelectorAll<HTMLButtonElement>('.pg-mode'),
  )) {
    if (button.dataset.bound === 'yes') continue
    button.dataset.bound = 'yes'
    button.addEventListener('click', () => setMode(button.dataset.mode ?? 'paper'))
  }

  const once = (sel: string, fn: () => void) => {
    const element = $<HTMLButtonElement>(sel)
    if (!element || element.dataset.bound === 'yes') return
    element.dataset.bound = 'yes'
    element.addEventListener('click', fn)
  }

  once('#pg-clear', () => choose([]))
  once('#pg-starter', () => choose(DEFAULT_SELECTION))
  once('#pg-everything', () => choose(ALL, SHOWCASE))

  const filter = $<HTMLInputElement>('#pg-filter')
  if (filter && filter.dataset.bound !== 'yes') {
    filter.dataset.bound = 'yes'
    filter.addEventListener('input', () => filterCatalogue(filter.value))
  }

  /*
    The link bar's own controls. Enter applies, Escape puts the caret back where
    it was — the two keys anybody tries before reaching for a button.
  */
  const linkInput = $<HTMLInputElement>('#pg-linkbar-input')
  if (linkInput && linkInput.dataset.bound !== 'yes') {
    linkInput.dataset.bound = 'yes'
    linkInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        applyLink()
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        hideLinkBar()
        editor?.commands.focus?.()
      }
    })
  }
  once('#pg-linkbar-ok', applyLink)
  once('#pg-linkbar-cancel', () => {
    hideLinkBar()
    editor?.commands.focus?.()
  })

  /*
    The palette's swatches, painted once and then delegated.

    `mousedown` rather than `click`, and prevented: a click on a button takes
    the caret out of the editor before the handler runs, and the command would
    then have no block to colour. The link bar does not have this problem
    because it re-selects a range it stored; block colour has nowhere to store.
  */
  const textRow = $('#pg-palette-text')
  const backRow = $('#pg-palette-bg')
  if (textRow && backRow && textRow.dataset.bound !== 'yes') {
    textRow.dataset.bound = 'yes'
    paintSwatches(textRow, 'text')
    paintSwatches(backRow, 'back')
  }
  const palette = $('#pg-palette')
  if (palette && palette.dataset.bound !== 'yes') {
    palette.dataset.bound = 'yes'
    palette.addEventListener('mousedown', (event) => {
      const swatch = (event.target as HTMLElement | null)?.closest<HTMLElement>('.pg-swatch')
      if (!swatch) return
      event.preventDefault()
      applySwatch(swatch)
    })
    /*
      Dismissal. `mousedown` fires before the `click` that opens it, so the
      first press on the toolbar button reads as "already hidden" and falls
      through — no need to special-case the opener beyond leaving it alone.
    */
    window.document.addEventListener('mousedown', (event) => {
      if (palette.hidden) return
      const target = event.target as HTMLElement | null
      if (target && (palette.contains(target) || target.closest('[data-ext="blockColor"]')))
        return
      hidePalette()
    })
    window.document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || palette.hidden) return
      hidePalette()
      editor?.commands.focus?.()
    })
  }
  once('#pg-palette-clear', () => {
    ;(
      editor?.commands as Record<string, (() => boolean) | undefined> | undefined
    )?.unsetBlockColors?.()
    hidePalette()
    editor?.commands.focus?.()
  })

  /* The code drawer opens and shuts on a button, so Copy can share its row. */
  const toggle = $<HTMLButtonElement>('#pg-code-toggle')
  if (toggle && toggle.dataset.bound !== 'yes') {
    toggle.dataset.bound = 'yes'
    toggle.addEventListener('click', () => {
      const body = $('#pg-code-body')
      if (!body) return
      const open = toggle.getAttribute('aria-expanded') !== 'false'
      body.hidden = open
      toggle.setAttribute('aria-expanded', String(!open))
    })
  }

  const copy = $<HTMLButtonElement>('#pg-copy')
  if (copy && copy.dataset.bound !== 'yes') {
    copy.dataset.bound = 'yes'
    copy.addEventListener('click', async () => {
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
  }

  /*
    Clicking a highlight opens its thread. Delegated to the document, because
    the highlights are inside an editor that is thrown away and rebuilt on every
    tick — a listener on the span would last until the next box.
  */
  if (!window.document.body.dataset.pgComments) {
    window.document.body.dataset.pgComments = 'yes'
    window.document.addEventListener('mousedown', (event) => {
      const anchor = (event.target as HTMLElement | null)?.closest?.('[data-comment]')
      const id = (anchor as HTMLElement | null)?.dataset.comment
      if (id) focusThread(id, false)
    })
  }

  selected.clear()
  for (const name of initialSelection(new Set(ALL))) selected.add(name)
  setMode(initialMode(), false)
  rebuild()
}

void start()
window.document.addEventListener('astro:page-load', () => {
  void start()
})
