/**
 * What is drawn on an element is what the document says, after any edit.
 *
 * The renderer patches an element rather than rebuilding it when the
 * decorations over it did not change, and it used to decide that by mapping
 * last render's decorations through the edit. A decoration whose whole range
 * the edit replaced mapped to nothing — so the element looked undecorated
 * on both sides of the comparison, was patched, and kept its class.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { focus, search, starterKit } from './extensions'
import type { Pos } from './types'

const mount = <T extends { mount(el: HTMLElement): void }>(editor: T) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

describe('a node decoration', () => {
  it('leaves the element when the document is replaced under it', () => {
    const editor = createEditor({
      extensions: [...starterKit, focus()] as const,
      content: '<p>hello world</p><p>x</p>',
    })
    const element = mount(editor)
    editor.commands.select(1 as Pos)
    expect(element.querySelectorAll('.has-focus').length).toBe(1)
    editor.setContent('<p>a</p><p>b</p>')
    editor.commands.select(5 as Pos)
    const focused = element.querySelectorAll('.has-focus')
    expect(focused.length).toBe(1)
    expect(focused[0]?.textContent).toBe('b')
    editor.destroy()
  })

  it('follows the caret through a change of block type', () => {
    const editor = createEditor({
      extensions: [...starterKit, focus()] as const,
      content: '<p>hello world</p>',
    })
    const element = mount(editor)
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.setHeading(2)
    editor.commands.setParagraph()
    editor.setContent('<p>a</p><p>b</p>')
    editor.commands.select(4 as Pos)
    const focused = Array.from(element.querySelectorAll('.has-focus'), (el) => el.textContent)
    expect(focused).toEqual(['b'])
    editor.destroy()
  })
})

describe('an inline decoration', () => {
  it('goes when the text it marked is replaced by text it does not match', () => {
    const editor = createEditor({
      extensions: [...starterKit, search()] as const,
      content: '<p>hello world</p>',
    })
    const element = mount(editor)
    editor.commands.setSearch('hello')
    expect(element.querySelectorAll('.matra-search-match').length).toBe(1)
    editor.setContent('<p>hallo world</p>')
    expect(element.querySelectorAll('.matra-search-match').length).toBe(0)
    editor.setContent('<p>hello world</p>')
    expect(element.querySelectorAll('.matra-search-match').length).toBe(1)
    editor.destroy()
  })
})
