import {
  blockquote,
  bold,
  bulletList,
  createEditor,
  document as doc,
  heading,
  italic,
  listItem,
  orderedList,
  paragraph,
  suggestion,
  text,
} from '@matrajs/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { watchSlash } from './slash'

/**
 * The menu, driven the way a person drives it.
 *
 * `slash-flow.test.ts` in core proves the primitives underneath; this proves
 * the part a visitor touches — that typing the trigger puts a list on screen,
 * that the arrows move the highlight, that Enter converts the block, and that
 * an editor is never offered a command it does not have.
 */
const PROSE = [
  doc,
  paragraph,
  text,
  heading,
  blockquote,
  bulletList,
  orderedList,
  listItem,
  bold,
  italic,
  suggestion({ char: '/', name: 'slash' }),
]

/** A comment box: marks only, and therefore no blocks to offer. */
const PLAIN = [doc, paragraph, text, bold, italic, suggestion({ char: '/', name: 'slash' })]

const menu = () => globalThis.document.querySelector('.slash-menu')
const rows = () =>
  Array.from(globalThis.document.querySelectorAll('.slash-item')).map(
    (row) => row.querySelector('.slash-name')?.textContent ?? '',
  )
const highlighted = () =>
  globalThis.document.querySelector('.slash-item.on .slash-name')?.textContent

function open(extensions: unknown[], typed = '/') {
  const host = globalThis.document.createElement('div')
  globalThis.document.body.appendChild(host)
  const editor = createEditor({ extensions: extensions as never, content: '<p></p>' })
  editor.mount(host)
  watchSlash(editor as never)
  editor.commands.select(1 as never)
  editor.commands.insert(typed)
  return editor
}

const press = (key: string) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  globalThis.document.dispatchEvent(event)
  return event
}

describe('the slash menu', () => {
  beforeEach(() => {
    globalThis.document.body.replaceChildren()
    menu()?.remove()
  })

  it('opens on the trigger and lists blocks', () => {
    open(PROSE)
    expect(menu()?.hasAttribute('hidden')).toBe(false)
    expect(rows()).toContain('Heading 1')
    expect(rows()).toContain('Bulleted list')
  })

  it('offers only what the editor can actually do', () => {
    open(PLAIN)
    expect(rows()).toContain('Bold')
    // No heading extension means no heading row, rather than a row that lies.
    expect(rows()).not.toContain('Heading 1')
    expect(rows()).not.toContain('Bulleted list')
  })

  it('narrows as the query is typed', () => {
    const editor = open(PROSE)
    editor.commands.insert('quo')
    expect(rows()).toEqual(['Quote'])
  })

  it('matches aliases, not just names', () => {
    const editor = open(PROSE)
    editor.commands.insert('h2')
    expect(rows()).toEqual(['Heading 2'])
  })

  it('says so when nothing matches', () => {
    const editor = open(PROSE)
    editor.commands.insert('zzz')
    expect(rows()).toEqual([])
    expect(globalThis.document.querySelector('.slash-empty')?.textContent).toBe(
      'Nothing matches',
    )
  })

  it('the arrows move the highlight and wrap', () => {
    open(PROSE)
    const first = highlighted()
    press('ArrowDown')
    expect(highlighted()).not.toBe(first)
    press('ArrowUp')
    expect(highlighted()).toBe(first)
    // Up from the first entry lands on the last, rather than sticking.
    press('ArrowUp')
    expect(highlighted()).toBe(rows()[rows().length - 1])
  })

  it('Enter converts the block instead of splitting it', () => {
    const editor = open(PROSE, '/h1')
    expect(highlighted()).toBe('Heading 1')
    press('Enter')
    expect(editor.getHTML()).toBe('<h1></h1>')
    expect(menu()?.hasAttribute('hidden')).toBe(true)
  })

  it('Enter is taken from the editor, not shared with it', () => {
    open(PROSE, '/h1')
    // The keymap must never see it: an unprevented Enter here splits the
    // paragraph underneath the menu and the block conversion lands on the wrong
    // half.
    expect(press('Enter').defaultPrevented).toBe(true)
  })

  it('Escape closes it and leaves the text alone', () => {
    const editor = open(PROSE, '/quo')
    press('Escape')
    expect(menu()?.hasAttribute('hidden')).toBe(true)
    expect(editor.getHTML()).toBe('<p>/quo</p>')
  })

  it('Enter belongs to the editor again once the menu is shut', () => {
    open(PROSE, '/quo')
    press('Escape')
    expect(press('Enter').defaultPrevented).toBe(false)
  })

  it('closes when the trigger is deleted', () => {
    const editor = open(PROSE, '/qu')
    editor.commands.remove({ from: 1 as never, to: 4 as never } as never)
    expect(menu()?.hasAttribute('hidden')).toBe(true)
  })
})
