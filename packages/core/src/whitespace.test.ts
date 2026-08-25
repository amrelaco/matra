/**
 * Two things that look like nothing happening.
 *
 * Press space at the end of a line and the space is invisible until the next
 * character; press Enter and the new paragraph has no height. Both are the
 * browser doing what HTML says — collapsing trailing whitespace, and giving an
 * empty element no box — and both make the editor feel broken in the first
 * five seconds anyone touches it.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

const mount = (content: string) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = createEditor({ extensions: starterKit, content })
  editor.mount(element)
  return { editor, element }
}

describe('an empty block has somewhere to put the caret', () => {
  it('renders a break inside an empty paragraph', () => {
    const { element } = mount('<p></p>')
    const paragraph = element.querySelector('p')
    expect(paragraph?.childNodes.length).toBe(1)
    expect((paragraph?.firstChild as HTMLElement)?.tagName).toBe('BR')
  })

  it('does not put one in a paragraph that has text', () => {
    const { element } = mount('<p>text</p>')
    expect(element.querySelector('p br')).toBeNull()
  })

  it('adds one when a paragraph becomes empty', () => {
    const { editor, element } = mount('<p>gone</p>')
    editor.commands.select({ from: 1 as Pos, to: 5 as Pos })
    editor.commands.remove()
    expect(element.querySelector('p br')).not.toBeNull()
  })

  it('removes it again once something is typed', () => {
    const { editor, element } = mount('<p></p>')
    expect(element.querySelector('p br')).not.toBeNull()
    editor.commands.select(1 as Pos)
    editor.commands.insert('a')
    expect(element.querySelector('p br')).toBeNull()
    expect(editor.getText()).toBe('a')
  })

  it('is scaffolding, not content', () => {
    const { editor } = mount('<p></p>')
    // Reading the document back must not find a hard break in it.
    expect(editor.getJSON().content?.[0]?.content).toBeUndefined()
    expect(editor.getText()).toBe('')
    expect(editor.getHTML()).not.toContain('data-matra-filler')
  })

  it('survives a round trip through the parser', () => {
    const { editor } = mount('<p>one</p><p></p><p>two</p>')
    expect(editor.getJSON().content?.length).toBe(3)

    editor.setContent(editor.getHTML())
    // The blank paragraph is still there. getText joins blocks and an empty one
    // contributes nothing, so the count is what proves nothing was dropped.
    expect(editor.getJSON().content?.length).toBe(3)
    expect(editor.getJSON().content?.[1]?.content).toBeUndefined()
  })
})

describe('trailing spaces survive', () => {
  it('keeps a space typed at the end of a paragraph', () => {
    const { editor } = mount('<p>word</p>')
    editor.commands.select(5 as Pos)
    editor.commands.insert(' ')
    expect(editor.getText()).toBe('word ')
  })

  it('keeps several', () => {
    const { editor } = mount('<p>word</p>')
    editor.commands.select(5 as Pos)
    editor.commands.insert('   ')
    expect(editor.getText()).toBe('word   ')
  })
})
