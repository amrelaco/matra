/**
 * The five editors, the toolbars that drive them, and the speed meter.
 *
 * These are built by hand rather than by the automatic upgrade in editable.ts,
 * because each one is making a specific point about which extensions it has —
 * the comment box's argument is what it *cannot* do.
 */
import {
  bold,
  characterCount,
  code,
  createEditor,
  document as doc,
  hardBreak,
  history,
  italic,
  link,
  paragraph,
  placeholder,
  starterKit,
  suggestion,
  tableKit,
  taskItem,
  taskList,
  text,
  textAlign,
  toMarkdown,
  typography,
} from '@matrajs/core'
import { watchSlash } from './slash'

type AnyEditor = ReturnType<typeof createEditor>
const editors = new Map<string, AnyEditor>()
/**
 * The elements the live editors are in.
 *
 * The router replaces the whole body on a client-side navigation, so the
 * editors from the previous visit are attached to elements that are no longer
 * in the document. Holding the elements is how a re-run tells "this page is
 * already wired" from "this is the same page again, freshly parsed".
 */
let hosts: HTMLElement[] = []

/** The slash menu, shared by name so every demo reads the same state key. */
const slash = () => suggestion({ char: '/', name: 'slash' })

const mount = (id: string, make: () => AnyEditor) => {
  const element = window.document.getElementById(`ed-${id}`)
  if (!element) return
  const editor = make()
  editor.mount(element)
  watchSlash(editor as never)
  editors.set(id, editor)
  hosts.push(element)
}

function mountAll(): void {
  mount('notion', () =>
    createEditor({
      extensions: [
        ...starterKit,
        taskList,
        taskItem,
        typography,
        slash(),
        placeholder({ text: "Write, or start a line with '/'…" }),
      ],
      content:
        '<h1>A block editor</h1>' +
        '<p>The same package as every other editor on this page.</p>' +
        '<ul data-type="taskList">' +
        '<li data-checked="true"><p>Ship the drag handle</p></li>' +
        '<li data-checked="false"><p>Write the landing page</p></li>' +
        '</ul>' +
        '<p>Smart quotes are on here, so "this" curls as you type.</p>',
    }),
  )

  mount('comment', () =>
    createEditor({
      extensions: [doc, paragraph, text, bold, italic, code, link, history, characterCount()],
      content: '<p>Looks right to me — the <code>moveBlock</code> command reads well.</p>',
    }),
  )

  mount('docs', () =>
    createEditor({
      extensions: [...starterKit, ...tableKit, textAlign(), typography, slash()],
      content:
        '<h2>Quarterly note</h2>' +
        '<p>A toolbar, headings and quotes — the shape people expect when the word "document" is used.</p>' +
        '<blockquote><p>Every button above is a command call.</p></blockquote>',
    }),
  )

  mount('markdown', () =>
    createEditor({
      extensions: [...starterKit, taskList, taskItem, slash()],
      content:
        '<h2>Markdown, live</h2>' +
        '<p>The panel beside this comes from <strong>toMarkdown</strong>, which never touches the DOM.</p>' +
        '<ul><li>Type here</li><li>Watch it update</li></ul>',
    }),
  )

  mount('chat', () =>
    createEditor({
      extensions: [doc, paragraph, text, bold, italic, code, hardBreak, history],
      content: '<p>Nice — is it on npm yet?</p>',
    }),
  )
}

// --- the chat actually sends ------------------------------------------------
/**
 * Enter sends, Shift-Enter breaks the line.
 *
 * A send button that does nothing is worse than no send button: the section is
 * arguing that constraining an editor is real work, and a dead control argues
 * the opposite.
 */
function wireChat(): void {
  const chat = editors.get('chat')
  const log = window.document.getElementById('chat-log')
  const send = window.document.getElementById('chat-send')
  if (!chat || !log || !send) return

  const post = () => {
    const text = chat.getText().trim()
    if (!text) return

    const bubble = window.document.createElement('div')
    bubble.className = 'bubble me'
    // textContent, not innerHTML: this is somebody else's typing.
    bubble.textContent = text
    log.appendChild(bubble)
    log.scrollTop = log.scrollHeight

    chat.setContent('<p></p>')
    chat.commands.focus()
  }

  send.addEventListener('click', post)

  const element = window.document.getElementById('ed-chat')
  element?.addEventListener('keydown', (event) => {
    const key = event as KeyboardEvent
    if (key.key !== 'Enter' || key.shiftKey) return
    key.preventDefault()
    post()
  })
}

// --- toolbars ---------------------------------------------------------------
/**
 * Buttons that are command calls, and light up when the command is already on.
 *
 * A button for a command this editor does not have is removed rather than left
 * to do nothing: the section's whole argument is that the extension array is
 * the feature list, so a toolbar that outruns it is arguing the opposite.
 */
const TEXT_ALIGN = ['left', 'center', 'right']

function wireTools(): void {
  for (const button of Array.from(
    window.document.querySelectorAll<HTMLButtonElement>('[data-cmd]'),
  )) {
    const editor = editors.get(button.dataset.for ?? '')
    const commands = editor?.commands as unknown as
      | Record<string, ((...args: unknown[]) => boolean) | undefined>
      | undefined

    if (!editor || typeof commands?.[button.dataset.cmd ?? ''] !== 'function') {
      button.remove()
      continue
    }

    const raw = button.dataset.arg
    const name = button.dataset.cmd ?? ''
    // setTextAlign takes a word, everything else that takes anything takes a
    // number. The button carries an index so the markup stays declarative.
    const argument =
      raw === undefined
        ? undefined
        : name === 'setTextAlign'
          ? TEXT_ALIGN[Number(raw)]
          : Number(raw)

    button.addEventListener('mousedown', (event) => {
      // Keep the caret where it is: focus must not leave the editor, or the
      // command runs against a collapsed selection instead of the words chosen.
      event.preventDefault()
      commands?.[name]?.(argument)
    })
  }

  for (const editor of editors.values()) {
    editor.on('change', paintTools)
    editor.on('selectionChange', paintTools)
  }
  paintTools()
}

/** Redraw every button's on/off state from the document, not from clicks. */
function paintTools(): void {
  for (const button of Array.from(
    window.document.querySelectorAll<HTMLButtonElement>('[data-active]'),
  )) {
    const editor = editors.get(button.dataset.for ?? '')
    if (!editor) continue
    const state = button.dataset.active as string
    const arg = button.dataset.activeArg
    const attrs = arg === undefined ? undefined : { level: Number(arg) }
    button.setAttribute('aria-pressed', String(editor.isActive(state, attrs)))
  }
}

// --- the counter, from the real extension -----------------------------------
function wireCounter(): void {
  const commentEditor = editors.get('comment')
  const countLabel = window.document.getElementById('count-comment')
  if (!commentEditor || !countLabel) return
  const render = () => {
    const characters = commentEditor.getText().length
    countLabel.textContent = `${characters} character${characters === 1 ? '' : 's'}`
  }
  commentEditor.on('change', render)
  render()
}

// --- live markdown ----------------------------------------------------------
function wireMarkdown(): void {
  const markdownEditor = editors.get('markdown')
  const markdownOut = window.document.getElementById('md-output')
  if (!markdownEditor || !markdownOut) return
  const render = () => {
    markdownOut.textContent = toMarkdown(markdownEditor.getJSON())
  }
  markdownEditor.on('change', render)
  render()
}

// --- install command --------------------------------------------------------
// Both words are in the markup and CSS shows one, the same way the theme
// toggle carries both of its glyphs. Rewriting the label from here would have
// meant editing whichever span happened to be first, which after the button
// was redrawn was the one that says "copy" when it is not copying.
function wireCopy(): void {
  const copy = window.document.getElementById('copy')
  copy?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText('npm i @matrajs/core')
    copy.classList.add('done')
    window.setTimeout(() => copy.classList.remove('done'), 1400)
  })
}

// --- the bars draw themselves -----------------------------------------------
/**
 * Grow the comparison when it is reached, not when the page loads.
 *
 * The chart sits a long way down. Animating it on load means it is finished
 * before anybody arrives, which is the same as not animating it — and a bar
 * that draws itself is the difference between reading a comparison and
 * watching one happen.
 */
function growCharts(): void {
  const charts = Array.from(window.document.querySelectorAll('.chart'))
  if (charts.length === 0) return
  if (!('IntersectionObserver' in window)) {
    for (const chart of charts) chart.classList.add('grown')
    return
  }
  const watcher = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('grown')
        watcher.unobserve(entry.target)
      }
    },
    { threshold: 0.15 },
  )
  for (const chart of charts) watcher.observe(chart)
}

// --- the speed meter --------------------------------------------------------
/**
 * Parse two thousand paragraphs and type into them, off-screen, then print what
 * it cost. A table of my numbers is a claim; the same numbers from the reader's
 * machine are not.
 */
function measure(): void {
  // `contain: strict` is the whole reason this can be trusted next to the chart.
  // Reading the layout is what makes a keystroke measurement real, and reading
  // it here would otherwise lay out this entire page — five mounted editors, a
  // table and a chart — and charge the editor for it. Containment keeps the
  // reflow inside this subtree, which is the only thing the reader is being
  // told about. Size containment collapses the box, so it is given one.
  const host = window.document.createElement('div')
  host.style.cssText =
    'position:absolute;left:-99999px;top:0;width:800px;height:900px;contain:strict'
  window.document.body.appendChild(host)

  // The same document the chart's row parses, in the same form. An earlier
  // version of this built the editor from JSON while the row beside it parsed
  // HTML, so the two numbers described different work under one word and
  // disagreed by 4×.
  const big = Array.from(
    { length: 2000 },
    (_, i) => `<p>Paragraph ${i} with a reasonable amount of prose.</p>`,
  ).join('')

  const parseStart = performance.now()
  const editor = createEditor({ extensions: starterKit, content: big })
  const parseMs = performance.now() - parseStart

  editor.mount(host)
  const sample = () => {
    const started = performance.now()
    for (let i = 0; i < 60; i++) {
      editor.commands.select(1 as never)
      editor.commands.insert('a')
      // Inside the loop, not after it. Reading the layout once per sixty
      // keystrokes lets fifty-nine of them defer their layout work into the
      // sixtieth, which reported a quarter of the cost the chart below prints
      // for the same operation — the same number, on the same page,
      // disagreeing with itself. A typist gets a layout per character.
      void host.offsetHeight
    }
    return (performance.now() - started) / 60
  }
  // Warm up properly. The chart below this measures with five warm-up rounds,
  // and a cold first call here reported serialisation at five times the figure
  // printed two hundred pixels away — the same operation, disagreeing with
  // itself on the same page.
  sample()
  sample()
  sample()
  const samples = [sample(), sample(), sample(), sample(), sample()].sort((a, b) => a - b)

  // Serialising is the third thing the table measures, and the one every
  // autosave does on a timer, so it is worth showing live rather than asking
  // the reader to take the row on trust.
  const htmlSample = () => {
    const started = performance.now()
    editor.getHTML()
    return performance.now() - started
  }
  htmlSample()
  htmlSample()
  htmlSample()
  const htmlSamples = [
    htmlSample(),
    htmlSample(),
    htmlSample(),
    htmlSample(),
    htmlSample(),
  ].sort((a, b) => a - b)

  editor.destroy()
  host.remove()

  const set = (id: string, value: string) => {
    const node = window.document.getElementById(id)
    if (node) node.textContent = value
  }
  set('meter-key', `${(samples[2] as number).toFixed(2)} ms`)
  set('meter-parse', `${parseMs.toFixed(1)} ms`)
  set('meter-html', `${(htmlSamples[2] as number).toFixed(1)} ms`)
  set(
    'meter-note',
    `2,000 paragraphs, measured on this machine just now · ${navigator.userAgent.includes('Firefox') ? 'Gecko' : navigator.userAgent.includes('Chrome') ? 'Blink' : 'WebKit'}`,
  )
}

/**
 * Wire the page, on arrival and on every arrival after that.
 *
 * The router swaps the body without reloading, and a module only ever runs
 * once — so everything here used to happen on the first page a visitor landed
 * on and never again. Arriving at the landing page from the docs left five
 * unmounted editors, dead toolbars, flat bars and a meter that said
 * "measuring…" forever, and the page's whole argument is that it is live.
 *
 * Guarded by the elements rather than by a flag: `astro:page-load` also fires
 * on the first load, and re-running there would mount everything twice and set
 * the meter measuring for a second time.
 */
function setup(): void {
  const target = window.document.getElementById('ed-notion')
  if (target && hosts.includes(target)) return

  for (const editor of editors.values()) editor.destroy()
  editors.clear()
  hosts = []

  mountAll()
  wireChat()
  wireTools()
  wireCounter()
  wireMarkdown()
  wireCopy()
  growCharts()

  // Only where there is a meter to fill. It parses two thousand paragraphs and
  // types into them; doing that on a page with nowhere to print it is a second
  // of somebody's phone spent on nothing.
  if (!window.document.getElementById('meter-key')) return

  // After the page has finished arriving, not during. Measured while the fonts
  // were still landing and every paragraph on the page was upgrading itself,
  // the keystroke figure came out seven times what the chart two hundred pixels
  // below prints for the same operation — a number about this machine's next
  // second rather than about the editor.
  const start = () => {
    const idle = (window as { requestIdleCallback?: (fn: () => void) => void })
      .requestIdleCallback
    if (idle) idle(() => measure())
    else window.setTimeout(measure, 1500)
  }
  if (window.document.readyState === 'complete') start()
  else window.addEventListener('load', start, { once: true })
}

setup()
document.addEventListener('astro:page-load', setup)
