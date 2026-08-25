/**
 * Five live editors and a benchmark, all from one import.
 *
 * The page claims the editor is small and fast. Both claims are checked here in
 * the visitor's own browser rather than asserted from a table: every editor is
 * real, and the speed meter measures this machine.
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
  taskItem,
  taskList,
  text,
  toMarkdown,
  typography,
} from '@matrajs/core'

type AnyEditor = ReturnType<typeof createEditor>
const editors = new Map<string, AnyEditor>()

const mount = (id: string, make: () => AnyEditor) => {
  const element = window.document.getElementById(`ed-${id}`)
  if (!element) return
  const editor = make()
  editor.mount(element)
  editors.set(id, editor)
}

// --- 1. block editor --------------------------------------------------------
mount('notion', () =>
  createEditor({
    extensions: [
      ...starterKit,
      taskList,
      taskItem,
      typography,
      placeholder({ text: "Write, or start a line with '-' for a list…" }),
    ],
    content:
      '<h1>A block editor</h1>' +
      '<p>Same package as every other editor on this page.</p>' +
      '<ul data-type="taskList">' +
      '<li data-checked="true">Ship the drag handle</li>' +
      '<li data-checked="false">Write the landing page</li>' +
      '</ul>' +
      '<p>Smart quotes are on here, so "this" curls as you type.</p>',
  }),
)

// --- 2. comment box ---------------------------------------------------------
mount('comment', () =>
  createEditor({
    // Deliberately tiny: a comment box that can make headings is a bug report.
    extensions: [doc, paragraph, text, bold, italic, code, link, history, characterCount()],
    content: '<p>Looks right to me — the <code>moveBlock</code> command reads well.</p>',
  }),
)

// --- 3. document ------------------------------------------------------------
mount('docs', () =>
  createEditor({
    extensions: [...starterKit, typography],
    content:
      '<h1>Quarterly note</h1>' +
      '<p>A toolbar, headings, quotes and tables — the shape people expect when the word "document" is used.</p>' +
      '<blockquote><p>Every button above is a command call.</p></blockquote>',
  }),
)

// --- 4. markdown ------------------------------------------------------------
mount('markdown', () =>
  createEditor({
    extensions: [...starterKit, taskList, taskItem],
    content:
      '<h2>Markdown, live</h2>' +
      '<p>The output beside this comes from <strong>toMarkdown</strong>, which never touches the DOM — so the same call runs on a server.</p>' +
      '<ul><li>Type here</li><li>Watch it update</li></ul>',
  }),
)

// --- 5. chat ----------------------------------------------------------------
mount('chat', () =>
  createEditor({
    extensions: [doc, paragraph, text, bold, italic, code, hardBreak, history],
    content: '<p>Nice — is it on npm yet?</p>',
  }),
)

// --- toolbars ---------------------------------------------------------------
for (const button of Array.from(
  window.document.querySelectorAll<HTMLButtonElement>('[data-cmd]'),
)) {
  button.addEventListener('mousedown', (event) => {
    // Keep the caret where it is: focus must not leave the editor.
    event.preventDefault()
    const editor = editors.get(button.dataset.for ?? '')
    if (!editor) return
    const commands = editor.commands as unknown as Record<
      string,
      (...args: unknown[]) => boolean
    >
    const argument = button.dataset.arg
    commands[button.dataset.cmd ?? '']?.(argument ? Number(argument) : undefined)
  })
}

// --- character count --------------------------------------------------------
const commentEditor = editors.get('comment')
const countLabel = window.document.getElementById('count-comment')
if (commentEditor && countLabel) {
  const render = () => {
    const characters = commentEditor.getText().length
    countLabel.textContent = `${characters} character${characters === 1 ? '' : 's'}`
  }
  commentEditor.on('change', render)
  render()
}

// --- live markdown ----------------------------------------------------------
const markdownEditor = editors.get('markdown')
const markdownOut = window.document.getElementById('md-output')
if (markdownEditor && markdownOut) {
  const render = () => {
    markdownOut.textContent = toMarkdown(markdownEditor.getJSON())
  }
  markdownEditor.on('change', render)
  render()
}

// --- tabs -------------------------------------------------------------------
for (const tab of Array.from(window.document.querySelectorAll<HTMLButtonElement>('.tab'))) {
  tab.addEventListener('click', () => {
    const target = tab.dataset.target
    for (const other of Array.from(window.document.querySelectorAll('.tab'))) {
      const on = other === tab
      other.classList.toggle('on', on)
      other.setAttribute('aria-selected', String(on))
    }
    for (const panel of Array.from(window.document.querySelectorAll<HTMLElement>('.panel'))) {
      panel.classList.toggle('on', panel.dataset.panel === target)
    }
  })
}

// --- the speed meter --------------------------------------------------------
/**
 * Type into a two-thousand-paragraph document and report what it cost.
 *
 * Run after everything visible is up, and against a document nobody can see.
 * The point is the number, and the number has to come from this machine or it
 * is just the table again.
 */
function measure(): void {
  const host = window.document.createElement('div')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px'
  window.document.body.appendChild(host)

  const big = {
    type: 'doc',
    content: Array.from({ length: 2000 }, (_, i) => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `Paragraph ${i} with a reasonable amount of ordinary prose in it.`,
        },
      ],
    })),
  }

  const parseStart = performance.now()
  const editor = createEditor({ extensions: starterKit, content: big as never })
  const parseMs = performance.now() - parseStart

  editor.mount(host)
  const sample = () => {
    const started = performance.now()
    for (let i = 0; i < 60; i++) {
      editor.commands.select(1 as never)
      editor.commands.insert('a')
    }
    void host.offsetHeight
    return (performance.now() - started) / 60
  }
  sample()
  const samples = [sample(), sample(), sample(), sample(), sample()].sort((a, b) => a - b)
  const keyMs = samples[2] as number

  editor.destroy()
  host.remove()

  const set = (id: string, value: string) => {
    const node = window.document.getElementById(id)
    if (node) node.textContent = value
  }
  set('meter-key', `${keyMs.toFixed(2)} ms`)
  set('meter-parse', `${parseMs.toFixed(0)} ms`)
  set('meter-note', 'measured on this machine, just now')
}

const idle = (window as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback
if (idle) idle(() => measure())
else window.setTimeout(measure, 600)
