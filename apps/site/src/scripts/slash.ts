/**
 * A slash menu, on everything editable on this page.
 *
 * The detection is the `suggestion` extension doing the job it was written for:
 * it finds the trigger, tracks the query and marks the range, and renders
 * nothing. Everything here is interface — which is the whole argument for the
 * extension being headless, and it may as well be made on the product's own
 * site.
 *
 * One menu element is shared by every editor on the page, because only one can
 * be open, and each editor is offered only the commands its own extensions
 * provide: the comment box has no headings, so its menu has no headings.
 */
import {
  CheckListIcon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  MinusSignIcon,
  ParagraphIcon,
  SourceCodeIcon,
  Table01Icon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from '@hugeicons/core-free-icons'
import { activeSuggestion } from '@matrajs/core'
import { type IconData, icon } from './icon'

type AnyEditor = {
  commands: Record<string, ((...args: never[]) => boolean) | undefined>
  extensionState<S>(name: string): S | undefined
  on(event: 'change' | 'selectionChange', fn: () => void): () => void
}

interface Item {
  name: string
  hint: string
  /** Words that should also find it — "bullet" for a list, "h1" for a heading. */
  aliases: string[]
  /** Named rather than a closure, so a missing command means a hidden row. */
  command: string
  arg?: number
  glyph: IconData
}

const ITEMS: Item[] = [
  {
    name: 'Text',
    hint: 'Paragraph',
    aliases: ['p', 'body', 'paragraph'],
    command: 'setParagraph',
    glyph: ParagraphIcon as IconData,
  },
  {
    name: 'Heading 1',
    hint: 'Large title',
    aliases: ['h1', 'title', 'big'],
    command: 'toggleHeading',
    arg: 1,
    glyph: Heading01Icon as IconData,
  },
  {
    name: 'Heading 2',
    hint: 'Section title',
    aliases: ['h2', 'subtitle'],
    command: 'toggleHeading',
    arg: 2,
    glyph: Heading02Icon as IconData,
  },
  {
    name: 'Heading 3',
    hint: 'Small title',
    aliases: ['h3'],
    command: 'toggleHeading',
    arg: 3,
    glyph: Heading03Icon as IconData,
  },
  {
    name: 'Bulleted list',
    hint: 'Simple list',
    aliases: ['ul', 'bullet', 'unordered', 'list'],
    command: 'toggleBulletList',
    glyph: LeftToRightListBulletIcon as IconData,
  },
  {
    name: 'Numbered list',
    hint: 'Ordered',
    aliases: ['ol', 'ordered', 'number', 'list'],
    command: 'toggleOrderedList',
    glyph: LeftToRightListNumberIcon as IconData,
  },
  {
    name: 'To-do list',
    hint: 'Checkboxes',
    aliases: ['task', 'todo', 'check', 'checkbox'],
    command: 'toggleTaskList',
    glyph: CheckListIcon as IconData,
  },
  {
    name: 'Quote',
    hint: 'Set apart',
    aliases: ['blockquote', 'cite'],
    command: 'toggleBlockquote',
    glyph: LeftToRightBlockQuoteIcon as IconData,
  },
  {
    name: 'Code block',
    hint: 'Fenced',
    aliases: ['pre', 'snippet', 'fence'],
    command: 'toggleCodeBlock',
    glyph: SourceCodeIcon as IconData,
  },
  {
    name: 'Table',
    hint: 'Rows, columns',
    aliases: ['grid', 'sheet'],
    command: 'insertTable',
    glyph: Table01Icon as IconData,
  },
  {
    name: 'Divider',
    hint: 'A line',
    aliases: ['hr', 'rule', 'separator', 'line'],
    command: 'insertHorizontalRule',
    glyph: MinusSignIcon as IconData,
  },
  {
    name: 'Bold',
    hint: 'Mod-B',
    aliases: ['strong', 'b'],
    command: 'toggleBold',
    glyph: TextBoldIcon as IconData,
  },
  {
    name: 'Italic',
    hint: 'Mod-I',
    aliases: ['em', 'i'],
    command: 'toggleItalic',
    glyph: TextItalicIcon as IconData,
  },
  {
    name: 'Underline',
    hint: 'Mod-U',
    aliases: ['u'],
    command: 'toggleUnderline',
    glyph: TextUnderlineIcon as IconData,
  },
  {
    name: 'Strikethrough',
    hint: 'Mod-Shift-X',
    aliases: ['strike', 's', 'del'],
    command: 'toggleStrike',
    glyph: TextStrikethroughIcon as IconData,
  },
]

let menu: HTMLElement | null = null
let list: HTMLElement | null = null
let open = false
let index = 0
let matches: Item[] = []
let owner: AnyEditor | null = null
/** Rows, kept so moving the highlight is two class changes rather than a redraw. */
let rows: HTMLElement[] = []

function build(): HTMLElement {
  const element = document.createElement('div')
  element.className = 'slash-menu'
  element.setAttribute('role', 'listbox')
  element.setAttribute('aria-label', 'Insert a block')
  element.hidden = true

  const head = document.createElement('div')
  head.className = 'slash-head mono'
  head.textContent = 'Blocks'

  list = document.createElement('div')
  list.className = 'slash-list'

  element.append(head, list)
  document.body.appendChild(element)
  return element
}

/** Only what this editor can actually do, narrowed by what has been typed. */
function matching(editor: AnyEditor, query: string): Item[] {
  const available = ITEMS.filter((item) => typeof editor.commands[item.command] === 'function')
  const needle = query.toLowerCase().trim()
  if (!needle) return available
  return available.filter(
    (item) =>
      item.name.toLowerCase().startsWith(needle) ||
      item.aliases.some((alias) => alias.startsWith(needle)) ||
      item.name.toLowerCase().includes(needle),
  )
}

function draw(): void {
  if (!list) return
  rows = []
  list.replaceChildren()

  if (matches.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'slash-empty'
    empty.textContent = 'Nothing matches'
    list.appendChild(empty)
    return
  }

  matches.forEach((item, position) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'slash-item'
    row.setAttribute('role', 'option')

    const mark = document.createElement('span')
    mark.className = 'slash-glyph'
    mark.appendChild(icon(item.glyph))

    const name = document.createElement('span')
    name.className = 'slash-name'
    name.textContent = item.name

    const hint = document.createElement('span')
    hint.className = 'slash-hint mono'
    hint.textContent = item.hint

    row.append(mark, name, hint)
    // mousedown, not click: a click moves focus out of the editor first, and
    // the command then runs against a collapsed selection somewhere else.
    row.addEventListener('mousedown', (event) => {
      event.preventDefault()
      choose(position)
    })
    row.addEventListener('mousemove', () => {
      if (index === position) return
      index = position
      highlight()
    })
    rows.push(row)
    list?.appendChild(row)
  })
  highlight()
}

function highlight(): void {
  rows.forEach((row, position) => {
    const on = position === index
    row.classList.toggle('on', on)
    row.setAttribute('aria-selected', String(on))
    if (on) row.scrollIntoView({ block: 'nearest' })
  })
}

function place(): void {
  if (!menu) return
  // The extension decorates exactly the text that accepting would replace, so
  // the anchor to measure is already in the DOM and already the right shape.
  const box = document.querySelector('.matra-suggestion')?.getBoundingClientRect()
  if (!box) return

  const width = menu.offsetWidth || 264
  const height = menu.offsetHeight || 300
  const below = box.bottom + 8
  const fits = below + height < window.innerHeight

  menu.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`
  menu.style.top = fits ? `${below}px` : `${Math.max(12, box.top - height - 8)}px`
}

function show(editor: AnyEditor, query: string): void {
  // Rebuilt when detached, because the router replaces the whole body on
  // navigation and would otherwise leave this holding an orphaned element.
  if (!menu?.isConnected) menu = build()
  const first = !open || owner !== editor
  owner = editor
  matches = matching(editor, query)
  if (first) index = 0
  if (index >= matches.length) index = 0
  open = true
  menu.hidden = false
  draw()
  place()
}

function hide(): void {
  open = false
  owner = null
  if (menu) menu.hidden = true
}

function choose(position: number): void {
  const item = matches[position]
  const editor = owner
  if (!item || !editor) return

  // Take the "/query" out first, then act on the block it leaves behind — the
  // other order would turn the slash itself into a heading.
  const active = activeSuggestion(editor as never, 'slash')
  hide()
  if (active) editor.commands.remove?.(active.range as never)
  editor.commands[item.command]?.(item.arg as never)
  editor.commands.focus?.()
}

/**
 * While the menu is open the keys belong to it.
 *
 * Captured on the document so this runs before the editor's own keymap: Enter
 * has to pick a block rather than split the paragraph, and the arrows have to
 * move down the list rather than through the text.
 */
function keys(event: KeyboardEvent): void {
  if (!open || event.isComposing) return
  const count = matches.length

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (count === 0) return
      index = (index + 1) % count
      highlight()
      break
    case 'ArrowUp':
      event.preventDefault()
      if (count === 0) return
      index = (index - 1 + count) % count
      highlight()
      break
    case 'Enter':
    case 'Tab':
      if (count === 0) return
      event.preventDefault()
      event.stopPropagation()
      choose(index)
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      owner?.commands.cancelSuggestion?.()
      hide()
      break
    default:
      break
  }
}

/** Follow one editor's slash suggestion as it opens, filters and closes. */
export function watchSlash(editor: AnyEditor): void {
  const sync = () => {
    const active = activeSuggestion(editor as never, 'slash')
    if (active) show(editor, active.query)
    else if (owner === editor) hide()
  }
  editor.on('change', sync)
  editor.on('selectionChange', sync)
}

document.addEventListener('keydown', keys, true)
document.addEventListener('mousedown', (event) => {
  if (open && !menu?.contains(event.target as Node)) hide()
})
window.addEventListener('scroll', place, true)
window.addEventListener('resize', hide)
