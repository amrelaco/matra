import { UserIcon } from '@hugeicons/core-free-icons'
import { icon } from '../icon'
/**
 * The @ menu, built the same way the slash menu is.
 *
 * `mention` is a node with a command and no interface, which is the right
 * shape for it — a mention menu has to read from whatever the host calls a
 * directory, and no editor framework can know what that is. So this is the
 * host: a list of people, a filter, and one call to `insertMention`.
 *
 * It borrows the slash menu's classes on purpose. Two menus that behave the
 * same should look the same, and the alternative was a second copy of the same
 * forty lines of CSS.
 */
import { activeSuggestion } from './registry'

type AnyEditor = {
  commands: Record<string, ((...args: unknown[]) => boolean) | undefined>
  on(event: 'change' | 'selectionChange', fn: () => void): () => void
}

interface Person {
  id: string
  label: string
  role: string
}

/** A directory, standing in for one. */
const PEOPLE: Person[] = [
  { id: 'nahim', label: 'Nahim', role: 'Wrote the schema' },
  { id: 'ada', label: 'Ada Lovelace', role: 'Notes on the engine' },
  { id: 'grace', label: 'Grace Hopper', role: 'Compilers' },
  { id: 'alan', label: 'Alan Turing', role: 'Decidability' },
  { id: 'katherine', label: 'Katherine Johnson', role: 'Orbital mechanics' },
  { id: 'design', label: 'Design', role: 'A group, not a person' },
]

let menu: HTMLElement | null = null
let list: HTMLElement | null = null
let open = false
let index = 0
let matches: Person[] = []
let owner: AnyEditor | null = null
let rows: HTMLElement[] = []

function build(): HTMLElement {
  const element = document.createElement('div')
  element.className = 'slash-menu'
  element.setAttribute('role', 'listbox')
  element.setAttribute('aria-label', 'Mention someone')
  element.hidden = true

  const head = document.createElement('div')
  head.className = 'slash-head mono'
  head.textContent = 'People'

  list = document.createElement('div')
  list.className = 'slash-list'

  element.append(head, list)
  document.body.appendChild(element)
  return element
}

function draw(): void {
  if (!list) return
  rows = []
  list.replaceChildren()

  if (!matches.length) {
    const empty = document.createElement('div')
    empty.className = 'slash-empty'
    empty.textContent = 'Nobody by that name'
    list.appendChild(empty)
    return
  }

  matches.forEach((person, position) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'slash-item'
    row.setAttribute('role', 'option')

    const glyph = document.createElement('span')
    glyph.className = 'slash-glyph'
    glyph.appendChild(icon(UserIcon as never))

    const name = document.createElement('span')
    name.className = 'slash-name'
    name.textContent = person.label

    const hint = document.createElement('span')
    hint.className = 'slash-hint mono'
    hint.textContent = person.role

    row.append(glyph, name, hint)
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
  const box = document.querySelector('.matra-suggestion')?.getBoundingClientRect()
  if (!box) return
  const width = menu.offsetWidth || 264
  const height = menu.offsetHeight || 240
  const below = box.bottom + 8
  const fits = below + height < window.innerHeight
  menu.style.left = `${Math.max(12, Math.min(box.left, window.innerWidth - width - 12))}px`
  menu.style.top = fits ? `${below}px` : `${Math.max(12, box.top - height - 8)}px`
}

function show(editor: AnyEditor, query: string): void {
  if (!menu?.isConnected) menu = build()
  const needle = query.toLowerCase().trim()
  const first = !open || owner !== editor
  owner = editor
  matches = needle
    ? PEOPLE.filter((person) => person.label.toLowerCase().includes(needle))
    : PEOPLE
  if (first || index >= matches.length) index = 0
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
  const person = matches[position]
  const editor = owner
  if (!person || !editor) return
  // Take the "@query" out first, then insert — the other order leaves the
  // typed text sitting in front of the node it was meant to become.
  const active = activeSuggestion(editor as never, 'mention')
  hide()
  if (active) editor.commands.remove?.((active as { range: unknown }).range)
  editor.commands.insertMention?.({ id: person.id, label: person.label })
  editor.commands.focus?.()
}

function keys(event: KeyboardEvent): void {
  if (!open || event.isComposing) return
  const count = matches.length
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      if (count) index = (index + 1) % count
      highlight()
      break
    case 'ArrowUp':
      event.preventDefault()
      if (count) index = (index - 1 + count) % count
      highlight()
      break
    case 'Enter':
    case 'Tab':
      if (!count) return
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

let bound = false

/** Follow one editor's `@` suggestion as it opens, filters and closes. */
export function watchMentions(editor: AnyEditor): void {
  if (!bound) {
    bound = true
    document.addEventListener('keydown', keys, true)
    document.addEventListener('mousedown', (event) => {
      if (open && !menu?.contains(event.target as Node)) hide()
    })
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', hide)
  }
  const sync = () => {
    const active = activeSuggestion(editor as never, 'mention')
    if (active) show(editor, (active as { query: string }).query)
    else if (owner === editor) hide()
  }
  editor.on('change', sync)
  editor.on('selectionChange', sync)
}

/** Close it when the editor it belonged to is destroyed. */
export function closeMentions(): void {
  hide()
}
