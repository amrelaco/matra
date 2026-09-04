import {
  autolink,
  autosave,
  bubbleMenu,
  callout,
  calloutCSS,
  clearFormatting,
  codeHighlight,
  codeHighlightCSS,
  columnsCSS,
  columnsKit,
  createEditor,
  detailsCSS,
  detailsKit,
  dictation,
  dictationCSS,
  dictationSupported,
  embed,
  embedCSS,
  emoji,
  field,
  fieldsCSS,
  floatingMenu,
  focus,
  footnotesCSS,
  footnotesKit,
  ghostText,
  ghostTextCSS,
  hashtag,
  image,
  imageResize,
  imageResizeCSS,
  indent,
  invisibleCharacters,
  invisibleCharactersCSS,
  kbd,
  lineHeight,
  locked,
  lockedCSS,
  mathCSS,
  mathKit,
  pageBreak,
  pageBreakCSS,
  search,
  searchCSS,
  selectionHighlight,
  selectionHighlightCSS,
  smartPaste,
  snippets,
  starterKit,
  tableKit,
  textDirection,
  textStyle,
  textTransform,
  trailingNode,
  typewriter,
  youtube,
  youtubeCSS,
} from '@matrajs/core'
import type { DocNode } from '@matrajs/core'
import './style.css'

// The CSS the extensions ask for, pasted once.
document.head.appendChild(
  Object.assign(document.createElement('style'), {
    textContent: [
      searchCSS,
      calloutCSS,
      detailsCSS,
      codeHighlightCSS,
      youtubeCSS,
      embedCSS,
      columnsCSS,
      pageBreakCSS,
      lockedCSS,
      fieldsCSS,
      footnotesCSS,
      mathCSS,
      invisibleCharactersCSS,
      selectionHighlightCSS,
      imageResizeCSS,
      ghostTextCSS,
      dictationCSS,
      '.matra-hashtag { color: #4338ca }',
      '.bubble, .floating { display: flex; gap: 4px; padding: 4px; background: #fff; border: 1px solid #ddd; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,.08); z-index: 10 }',
      '.bubble button, .floating button { font: inherit; padding: 2px 8px }',
    ].join('\n'),
  }),
)

function need<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`playground: ${selector} missing from the page`)
  return el
}

const element = need<HTMLDivElement>('#editor')
const toolbarEl = need<HTMLDivElement>('#toolbar')
const out = need<HTMLPreElement>('#out')

/** The two menus are elements of the page's own; the editor only positions them. */
const menu = (className: string, labels: Array<[string, () => boolean]>) => {
  const el = document.createElement('div')
  el.className = className
  el.hidden = true
  for (const [label, run] of labels) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      run()
    })
    el.appendChild(button)
  }
  document.body.appendChild(el)
  return el
}

/** A completion source that finishes a few phrases, so ghost text has something to show. */
const PHRASES: Record<string, string> = {
  'Matra is': ' a headless rich text editor framework.',
  'The quick': ' brown fox jumps over the lazy dog.',
  'Best regards': ',\nNahim',
}
const suggest = ({ before }: { before: string }) => {
  for (const [start, rest] of Object.entries(PHRASES)) {
    for (let i = 2; i <= start.length; i++) {
      if (before.endsWith(start.slice(0, i))) return start.slice(i) + rest
    }
  }
  return null
}

const DRAFT = 'matra-playground-draft'

const bubble = menu('bubble', [
  ['B', () => editor.commands.toggleBold()],
  ['I', () => editor.commands.toggleItalic()],
  ['Link', () => editor.commands.setLink({ href: 'https://matrajs.com' })],
  ['AA', () => editor.commands.uppercase()],
])
const floating = menu('floating', [
  ['H1', () => editor.commands.toggleHeading(1)],
  ['List', () => editor.commands.toggleBulletList()],
  ['Table', () => editor.commands.insertTable(2, 2)],
])

const editor = createEditor({
  extensions: [
    ...starterKit,
    ...tableKit,
    ...detailsKit,
    ...columnsKit,
    ...footnotesKit(),
    ...mathKit(),
    image,
    textStyle,
    callout,
    youtube,
    clearFormatting,
    kbd,
    field,
    pageBreak,
    textTransform,
    embed(),
    search(),
    autolink(),
    emoji({ emoticons: true }),
    indent(),
    codeHighlight(),
    focus(),
    trailingNode(),
    locked(),
    lineHeight(),
    textDirection(),
    hashtag(),
    snippets([
      { trigger: 'sig', content: 'Best regards, Nahim' },
      { trigger: 'hr', content: { type: 'horizontalRule' } },
    ]),
    invisibleCharacters(),
    selectionHighlight(),
    smartPaste(),
    imageResize(),
    typewriter(),
    ghostText({ suggest, delay: 200 }),
    dictation(),
    bubbleMenu({ element: bubble }),
    floatingMenu({ element: floating }),
    autosave({
      delay: 800,
      save: (doc: DocNode) => localStorage.setItem(DRAFT, JSON.stringify(doc)),
      restore: () => {
        const saved = localStorage.getItem(DRAFT)
        return saved ? (JSON.parse(saved) as DocNode) : null
      },
    }),
  ] as const,
  content: `
    <h1>Matra</h1>
    <p>A headless rich text editor framework. Select some text, or type <code>## </code> at the start of a line.</p>
    <blockquote><p>Extensions are plain objects; command types are inferred from the array you pass in.</p></blockquote>
    <ul><li><p>Press Tab inside a list to indent</p></li><li><p>Cmd-B toggles bold</p></li></ul>
    <p>Type <kbd>{{name}}</kbd> for a field, <kbd>#tag</kbd> for a hashtag, <kbd>$x^2$</kbd> for a formula, or "Matra is" and wait for a suggestion.</p>
  `,
  autofocus: true,
})

// The page moving under the caret is a surprise in a playground: opt in.
editor.commands.disableTypewriter()

/** Each button names a command and, optionally, how to know it is active. */
const buttons: Array<{
  label: string
  run: () => boolean
  active?: () => boolean
}> = [
  { label: 'H1', run: () => editor.commands.toggleHeading(1) },
  { label: 'H2', run: () => editor.commands.toggleHeading(2) },
  { label: 'Bold', run: () => editor.commands.toggleBold() },
  { label: 'Italic', run: () => editor.commands.toggleItalic() },
  { label: 'Strike', run: () => editor.commands.toggleStrike() },
  { label: 'Code', run: () => editor.commands.toggleCode() },
  {
    label: 'Kbd',
    run: () => editor.commands.toggleKbd(),
    active: () => editor.isActive('kbd'),
  },
  { label: 'Quote', run: () => editor.commands.toggleBlockquote() },
  { label: 'Code block', run: () => editor.commands.toggleCodeBlock() },
  { label: 'Bullets', run: () => editor.commands.toggleBulletList() },
  { label: 'Numbers', run: () => editor.commands.toggleOrderedList() },
  { label: 'Rule', run: () => editor.commands.insertHorizontalRule() },
  { label: 'Link', run: () => editor.commands.setLink({ href: 'https://matrajs.com' }) },
  {
    label: 'Red',
    run: () => editor.commands.setColor('#c00'),
    active: () => editor.isActive('textStyle'),
  },
  {
    label: 'Callout',
    run: () => editor.commands.toggleCallout('warning'),
    active: () => editor.isActive('callout'),
  },
  { label: 'Toggle', run: () => editor.commands.insertDetails() },
  {
    label: 'Table',
    run: () => editor.commands.insertTable(3, 3),
    active: () => editor.isActive('table'),
  },
  { label: '+Row', run: () => editor.commands.addRowAfter() },
  { label: '+Col', run: () => editor.commands.addColumnAfter() },
  {
    label: 'Video',
    run: () => editor.commands.insertYoutube({ src: 'https://youtu.be/dQw4w9WgXcQ' }),
  },
  {
    label: 'Embed',
    run: () => editor.commands.insertEmbed('https://player.vimeo.com/video/76979871'),
  },
  {
    label: 'Image',
    run: () =>
      editor.commands.insertImage({
        src: 'https://matrajs.com/favicon.svg',
        alt: 'The Matra mark',
      }),
  },
  {
    label: 'Columns',
    run: () => editor.commands.setColumns(2),
    active: () => editor.isActive('columnList'),
  },
  { label: 'No columns', run: () => editor.commands.unsetColumns() },
  { label: 'Page break', run: () => editor.commands.insertPageBreak() },
  {
    label: 'Lock',
    run: () => editor.commands.toggleLock(),
    active: () => editor.extensionState<{ here: boolean }>('locked')?.here === true,
  },
  { label: 'Field', run: () => editor.commands.insertField('name', 'Name') },
  { label: 'Fill', run: () => editor.commands.fillFields({ name: 'Ada Lovelace' }) },
  { label: 'Footnote', run: () => editor.commands.insertFootnote() },
  { label: 'Math', run: () => editor.commands.insertInlineMath('E = mc^2') },
  { label: 'AA', run: () => editor.commands.uppercase() },
  { label: 'Aa', run: () => editor.commands.sentenceCase() },
  { label: 'RTL', run: () => editor.commands.setTextDirection('rtl') },
  { label: 'LTR', run: () => editor.commands.unsetTextDirection() },
  { label: 'Line 1.8', run: () => editor.commands.setLineHeight(1.8) },
  {
    label: '¶',
    run: () => editor.commands.toggleInvisibleCharacters(),
    active: () =>
      editor.extensionState<{ visible: boolean }>('invisibleCharacters')?.visible === true,
  },
  {
    label: 'Typewriter',
    run: () => editor.commands.toggleTypewriter(),
    active: () => editor.extensionState<{ enabled: boolean }>('typewriter')?.enabled === true,
  },
  {
    label: 'Dictate',
    run: () => editor.commands.toggleDictation(),
    active: () =>
      editor.extensionState<{ listening: boolean }>('dictation')?.listening === true,
  },
  { label: 'Indent', run: () => editor.commands.indent() },
  { label: 'Clear', run: () => editor.commands.clearFormatting() },
  {
    label: 'Find "the"',
    run: () => editor.commands.setSearch('the') && editor.commands.nextMatch(),
  },
  { label: 'Save', run: () => editor.commands.save() },
  { label: 'Undo', run: () => editor.commands.undo() },
  { label: 'Redo', run: () => editor.commands.redo() },
]

const painted: Array<{ el: HTMLButtonElement; active: () => boolean }> = []
for (const button of buttons) {
  if (button.label === 'Dictate' && !dictationSupported()) continue
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = button.label
  el.addEventListener('mousedown', (event) => {
    // Keep the selection: the editor must not lose focus to the button.
    event.preventDefault()
    button.run()
  })
  toolbarEl.appendChild(el)
  if (button.active) painted.push({ el, active: button.active })
}

function render() {
  for (const { el, active } of painted) el.setAttribute('aria-pressed', String(active()))
  const saved = editor.extensionState<{ dirty: boolean; savedAt: number | null }>('autosave')
  out.textContent = `${saved?.dirty ? 'unsaved' : 'saved'}\n${JSON.stringify(editor.getJSON(), null, 2)}`
}

editor.on('change', render)
editor.on('selectionChange', render)
editor.mount(element)
render()

// Expose for poking around in the console — playground only.
Object.assign(window, { editor })
