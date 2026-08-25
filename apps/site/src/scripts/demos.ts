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
  tableKit,
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

mount('notion', () =>
  createEditor({
    extensions: [
      ...starterKit,
      taskList,
      taskItem,
      typography,
      placeholder({ text: "Write, or start a line with '-'…" }),
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
    extensions: [...starterKit, ...tableKit, typography],
    content:
      '<h2>Quarterly note</h2>' +
      '<p>A toolbar, headings and quotes — the shape people expect when the word "document" is used.</p>' +
      '<blockquote><p>Every button above is a command call.</p></blockquote>',
  }),
)

mount('markdown', () =>
  createEditor({
    extensions: [...starterKit, taskList, taskItem],
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

// --- toolbars ---------------------------------------------------------------
for (const button of Array.from(
  window.document.querySelectorAll<HTMLButtonElement>('[data-cmd]'),
)) {
  button.addEventListener('mousedown', (event) => {
    // Keep the caret where it is: focus must not leave the editor, or the
    // command runs against a collapsed selection instead of the words chosen.
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

// --- the counter, from the real extension -----------------------------------
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

// --- install command --------------------------------------------------------
const copy = window.document.getElementById('copy')
copy?.addEventListener('click', async () => {
  await navigator.clipboard?.writeText('npm i @matrajs/core')
  copy.textContent = 'copied'
  window.setTimeout(() => {
    copy.textContent = 'copy'
  }, 1400)
})

// --- the speed meter --------------------------------------------------------
/**
 * Parse two thousand paragraphs and type into them, off-screen, then print what
 * it cost. A table of my numbers is a claim; the same numbers from the reader's
 * machine are not.
 */
function measure(): void {
  const host = window.document.createElement('div')
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px'
  window.document.body.appendChild(host)

  const big = {
    type: 'doc',
    content: Array.from({ length: 2000 }, (_, i) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: `Paragraph ${i} with a reasonable amount of prose.` }],
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
  editor.destroy()
  host.remove()

  const set = (id: string, value: string) => {
    const node = window.document.getElementById(id)
    if (node) node.textContent = value
  }
  set('meter-key', `${(samples[2] as number).toFixed(2)} ms`)
  set('meter-parse', `${parseMs.toFixed(0)} ms`)
  set('meter-note', 'measured on this machine, just now')
}

const idle = (window as { requestIdleCallback?: (fn: () => void) => void }).requestIdleCallback
if (idle) idle(() => measure())
else window.setTimeout(measure, 900)
