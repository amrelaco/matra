import { createEditor, starterKit } from '@matrajs/core'
import './style.css'

function need<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector)
  if (!el) throw new Error(`playground: ${selector} missing from the page`)
  return el
}

const element = need<HTMLDivElement>('#editor')
const toolbarEl = need<HTMLDivElement>('#toolbar')
const out = need<HTMLPreElement>('#out')

const editor = createEditor({
  extensions: starterKit,
  content: `
    <h1>Matra</h1>
    <p>A headless rich text editor framework. Select some text, or type <code>## </code> at the start of a line.</p>
    <blockquote><p>Extensions are plain objects; command types are inferred from the array you pass in.</p></blockquote>
    <ul><li><p>Press Tab inside a list to indent</p></li><li><p>Cmd-B toggles bold</p></li></ul>
  `,
  autofocus: true,
})

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
  { label: 'Quote', run: () => editor.commands.toggleBlockquote() },
  { label: 'Code block', run: () => editor.commands.toggleCodeBlock() },
  { label: 'Bullets', run: () => editor.commands.toggleBulletList() },
  { label: 'Numbers', run: () => editor.commands.toggleOrderedList() },
  { label: 'Rule', run: () => editor.commands.insertHorizontalRule() },
  { label: 'Link', run: () => editor.commands.setLink({ href: 'https://matrajs.com' }) },
  { label: 'Undo', run: () => editor.commands.undo() },
  { label: 'Redo', run: () => editor.commands.redo() },
]

for (const button of buttons) {
  const el = document.createElement('button')
  el.type = 'button'
  el.textContent = button.label
  el.addEventListener('mousedown', (event) => {
    // Keep the selection: the editor must not lose focus to the button.
    event.preventDefault()
    button.run()
  })
  toolbarEl.appendChild(el)
}

function render() {
  out.textContent = JSON.stringify(editor.getJSON(), null, 2)
}

editor.on('change', render)
editor.on('selectionChange', render)
editor.mount(element)
render()

// Expose for poking around in the console — playground only.
Object.assign(window, { editor })
