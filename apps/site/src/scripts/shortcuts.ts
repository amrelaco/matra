/**
 * The keyboard, one press away, on every page.
 *
 * The whole site is editable and none of it says so. The slash menu is
 * discoverable because you type `/` and it appears; Mod-Alt-3 is not
 * discoverable by anybody. A page that hands you an editor and hides its keys
 * is a page that expects you to have read the docs first.
 *
 * The list is the one in the docs, kept in one place here and imported there,
 * so the two can never drift.
 */
import { Cancel01Icon, KeyboardIcon } from '@hugeicons/core-free-icons'
import { type IconData, icon } from './icon'

export interface Group {
  name: string
  keys: [string, string][]
}

export const GROUPS: Group[] = [
  {
    name: 'Blocks',
    keys: [
      ['/', 'The block menu, on an empty line'],
      ['Mod-Alt-1 … 6', 'Heading, levels one to six'],
      ['Mod-Alt-0', 'Back to a paragraph'],
      ['Mod-Shift-B', 'Quote'],
      ['Mod-Alt-C', 'Code block'],
    ],
  },
  {
    name: 'Marks',
    keys: [
      ['Mod-B', 'Bold'],
      ['Mod-I', 'Italic'],
      ['Mod-U', 'Underline'],
      ['Mod-E', 'Inline code'],
      ['Mod-Shift-X', 'Strikethrough'],
      ['Mod-Shift-H', 'Highlight'],
    ],
  },
  {
    name: 'Lists',
    keys: [
      ['Mod-Shift-8', 'Bulleted list'],
      ['Mod-Shift-9', 'Numbered list'],
      ['Mod-Shift-7', 'To-do list'],
      ['Mod-Enter', 'Tick or untick'],
      ['Tab', 'Indent'],
      ['Shift-Tab', 'Outdent'],
      ['Enter, on an empty item', 'Leave the list'],
    ],
  },
  {
    name: 'Typed, not pressed',
    keys: [
      ['# ', 'Heading'],
      ['- ', 'Bulleted list'],
      ['1. ', 'Numbered list'],
      ['[] ', 'To-do · [x] for one already done'],
      ['> ', 'Quote'],
      ['``` ', 'Code block'],
      ['-- ', 'An em dash · also ... -> (c) (tm)'],
    ],
  },
  {
    name: 'Editing',
    keys: [
      ['Mod-Z', 'Undo'],
      ['Mod-Shift-Z', 'Redo'],
      ['Shift-Enter', 'Line break inside a block'],
      ['Escape', 'Close whatever is open'],
    ],
  },
]

const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
/** `Mod` is Command on a Mac and Control everywhere else. Show the real one. */
const pretty = (key: string) => (MAC ? key.replace(/Mod/g, '⌘') : key.replace(/Mod/g, 'Ctrl'))

let panel: HTMLElement | null = null
let open = false

function build(): HTMLElement {
  const element = document.createElement('div')
  element.className = 'keys-panel'
  element.setAttribute('role', 'dialog')
  element.setAttribute('aria-label', 'Keyboard shortcuts')
  element.hidden = true

  const head = document.createElement('div')
  head.className = 'keys-head'

  const title = document.createElement('span')
  title.className = 'keys-title'
  title.textContent = 'Keyboard'

  const hint = document.createElement('span')
  hint.className = 'keys-hint mono'
  hint.textContent = 'press ? anywhere'

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'keys-close'
  close.setAttribute('aria-label', 'Close')
  close.appendChild(icon(Cancel01Icon as IconData, 15))
  close.addEventListener('click', () => hide())

  head.append(title, hint, close)

  const body = document.createElement('div')
  body.className = 'keys-body'

  for (const group of GROUPS) {
    const block = document.createElement('div')
    block.className = 'keys-group'

    const name = document.createElement('p')
    name.className = 'keys-group-name mono'
    name.textContent = group.name
    block.appendChild(name)

    for (const [key, what] of group.keys) {
      const row = document.createElement('div')
      row.className = 'keys-row'

      const kbd = document.createElement('kbd')
      kbd.textContent = pretty(key)

      const label = document.createElement('span')
      label.textContent = what

      row.append(kbd, label)
      block.appendChild(row)
    }
    body.appendChild(block)
  }

  element.append(head, body)
  document.body.appendChild(element)
  return element
}

function show(): void {
  // Rebuilt when detached: the router replaces the whole body on navigation.
  if (!panel?.isConnected) panel = build()
  panel.hidden = false
  open = true
  for (const button of buttons()) button.setAttribute('aria-expanded', 'true')
}

function hide(): void {
  open = false
  if (panel) panel.hidden = true
  for (const button of buttons()) button.setAttribute('aria-expanded', 'false')
}

const buttons = () => Array.from(document.querySelectorAll<HTMLElement>('[data-keys-toggle]'))

function toggle(): void {
  if (open) hide()
  else show()
}

/**
 * `?` opens it, unless you are typing.
 *
 * Every paragraph on this site is an editor, so a bare-letter shortcut has to
 * check where the caret is or a question mark in a sentence opens a dialog
 * over the sentence you are writing.
 */
function typing(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element || !element.closest) return false
  return element.closest('[contenteditable="true"], input, textarea') !== null
}

function wire(): void {
  for (const button of buttons()) {
    if (button.dataset.wired === 'true') continue
    button.dataset.wired = 'true'
    button.appendChild(icon(KeyboardIcon as IconData, 15))

    // The button says what it is and which key does it, rather than being a
    // square with a glyph in it that you have to press to find out.
    const label = document.createElement('span')
    label.textContent = 'Shortcuts'
    const key = document.createElement('kbd')
    key.textContent = '?'
    button.append(label, key)

    button.addEventListener('click', toggle)
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && open) {
    event.preventDefault()
    hide()
    return
  }
  if (event.key !== '?' || event.metaKey || event.ctrlKey) return
  if (typing(event.target)) return
  event.preventDefault()
  toggle()
})

document.addEventListener('mousedown', (event) => {
  if (!open) return
  const target = event.target as Node
  if (panel?.contains(target)) return
  if (buttons().some((button) => button.contains(target))) return
  hide()
})

wire()
document.addEventListener('astro:page-load', wire)
