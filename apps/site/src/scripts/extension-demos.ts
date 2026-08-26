/**
 * One editor per group on the extensions page.
 *
 * Each has exactly the extensions its group names and nothing else, which is
 * the point of the page: the array *is* the feature list, so a marks-only
 * editor has no Enter that makes a heading and no way to get one.
 */
import {
  blockquote,
  bold,
  bulletList,
  characterCount,
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
  placeholder,
  strike,
  suggestion,
  tableCell,
  tableHeader,
  table as tableNode,
  tableRow,
  taskItem,
  taskList,
  text,
  textAlign,
  typography,
  underline,
} from '@matrajs/core'
import { watchSlash } from './slash'

type AnyEditor = ReturnType<typeof createEditor>
const editors = new Map<string, AnyEditor>()
/** The elements the live editors are in · see the note in demos.ts. */
let hosts: HTMLElement[] = []

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
  mount('marks', () =>
    createEditor({
      extensions: [
        doc,
        paragraph,
        text,
        bold,
        italic,
        strike,
        code,
        underline,
        highlight,
        link,
        hardBreak,
        history,
        slash(),
      ],
      content:
        '<p>Select any of this and press a button, or <strong>Mod-B</strong> it. ' +
        'The marks here are <em>italic</em>, <s>strike</s>, <code>code</code>, ' +
        '<u>underline</u> and <mark>highlight</mark>.</p>' +
        '<p>There is no heading in this editor, so there is no way to make one.</p>',
    }),
  )

  mount('blocks', () =>
    createEditor({
      extensions: [
        doc,
        paragraph,
        text,
        heading,
        blockquote,
        codeBlock,
        horizontalRule,
        bold,
        italic,
        code,
        hardBreak,
        history,
        typography,
        slash(),
      ],
      content:
        '<h2>Start a line with a hash</h2>' +
        '<p>Then a space. Try <code>&gt;</code> for a quote and three backticks for a fence.</p>' +
        '<blockquote><p>Every one of these is an input rule, and every input rule is one undo.</p></blockquote>',
    }),
  )

  mount('lists', () =>
    createEditor({
      extensions: [
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
        slash(),
      ],
      content:
        '<ul data-type="taskList">' +
        '<li data-checked="true"><p>Tick this one · the text goes through</p></li>' +
        '<li data-checked="false"><p>Press Enter here for another box</p></li>' +
        '<li data-checked="false"><p>Then Tab to nest it, Shift-Tab to lift it</p></li>' +
        '</ul>' +
        '<ul><li><p>Ordinary bullets work the same way</p></li></ul>',
    }),
  )

  mount('tables', () =>
    createEditor({
      extensions: [
        doc,
        paragraph,
        text,
        tableNode,
        tableRow,
        tableCell,
        tableHeader,
        bold,
        italic,
        hardBreak,
        history,
        slash(),
      ],
      content:
        '<table><tbody>' +
        '<tr><th><p>Operation</p></th><th><p>Cost</p></th></tr>' +
        '<tr><td><p>Type in a cell</p></td><td><p>One block</p></td></tr>' +
        '<tr><td><p>Press Enter in one</p></td><td><p>Still one cell</p></td></tr>' +
        '</tbody></table>',
    }),
  )

  mount('writing', () =>
    createEditor({
      extensions: [
        doc,
        paragraph,
        text,
        bold,
        italic,
        hardBreak,
        history,
        typography,
        textAlign(),
        characterCount(),
        placeholder({ text: 'Type a "quote" and watch it curl…' }),
        slash(),
      ],
      content:
        '<p>Type "quotes" here and they curl the right way round -- and two hyphens do that.</p>' +
        '<p>Now type a word and press Mod-Z. It takes the whole word, not one letter.</p>',
    }),
  )
}

// --- toolbars ---------------------------------------------------------------
// The same contract the landing page uses: a button whose command this editor
// does not have is removed rather than left to do nothing.
const TEXT_ALIGN = ['left', 'center', 'right']

function wireTools(): void {
  for (const button of Array.from(
    window.document.querySelectorAll<HTMLButtonElement>('[data-cmd]'),
  )) {
    const editor = editors.get(button.dataset.for ?? '')
    const commands = editor?.commands as unknown as
      | Record<string, ((...args: unknown[]) => boolean) | undefined>
      | undefined
    const name = button.dataset.cmd ?? ''

    if (!editor || typeof commands?.[name] !== 'function') {
      button.remove()
      continue
    }

    const raw = button.dataset.arg
    const argument =
      raw === undefined
        ? undefined
        : name === 'setTextAlign'
          ? TEXT_ALIGN[Number(raw)]
          : Number(raw)

    button.addEventListener('mousedown', (event) => {
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

function paintTools(): void {
  for (const button of Array.from(
    window.document.querySelectorAll<HTMLButtonElement>('[data-active]'),
  )) {
    const editor = editors.get(button.dataset.for ?? '')
    if (!editor) continue
    const arg = button.dataset.activeArg
    button.setAttribute(
      'aria-pressed',
      String(
        editor.isActive(
          button.dataset.active as string,
          arg === undefined ? undefined : { level: Number(arg) },
        ),
      ),
    )
  }
}

/** Every copy button on the page · the group imports and the directory rows. */
function wireCopies(): void {
  for (const button of Array.from(
    window.document.querySelectorAll<HTMLButtonElement>('[data-copy]'),
  )) {
    button.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(button.dataset.copy ?? '')
      button.classList.add('done')
      window.setTimeout(() => button.classList.remove('done'), 1400)
    })
  }
}

/** Wire on arrival and on every arrival after that · see demos.ts. */
function setup(): void {
  const target = window.document.getElementById('ed-marks')
  if (target && hosts.includes(target)) return

  for (const editor of editors.values()) editor.destroy()
  editors.clear()
  hosts = []

  mountAll()
  wireTools()
  wireCopies()
}

setup()
document.addEventListener('astro:page-load', setup)
