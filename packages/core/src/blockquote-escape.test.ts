import { describe, expect, it } from 'vitest'
import { starterKit } from './extensions/starter-kit'
import { createEditor } from './index'
import type { Pos } from './types'

/**
 * Enter on the empty last line of a quote has to end the quote.
 *
 * Lists have had this since `splitListItem`; the block containers did not, so
 * a quote was a room with no door — every Enter made another paragraph inside
 * it and nothing got you out. The rule is deliberately narrow, and most of
 * these cases are about what it must *refuse* to do.
 */
describe('leaving a blockquote with Enter', () => {
  const mount = (content: string) => {
    const editor = createEditor({ extensions: starterKit, content })
    editor.mount(document.createElement('div'))
    return editor
  }

  it('lifts a trailing empty paragraph out of the quote', () => {
    const editor = mount('<blockquote><p>one</p><p></p></blockquote>')
    editor.commands.select(7 as Pos)
    expect(editor.commands.exitBlockquote()).toBe(true)
    expect(editor.getHTML()).toBe('<blockquote><p>one</p></blockquote><p></p>')
  })

  it('refuses when the line has text', () => {
    const editor = mount('<blockquote><p>one</p></blockquote>')
    editor.commands.select(4 as Pos)
    expect(editor.commands.exitBlockquote()).toBe(false)
    expect(editor.getHTML()).toBe('<blockquote><p>one</p></blockquote>')
  })

  it('refuses when the empty line is not the last child', () => {
    const editor = mount('<blockquote><p>a</p><p></p><p>b</p></blockquote>')
    editor.commands.select(5 as Pos)
    expect(editor.commands.exitBlockquote()).toBe(false)
  })

  it('refuses outside a quote, so ordinary Enter still runs', () => {
    const editor = mount('<p></p>')
    editor.commands.select(1 as Pos)
    expect(editor.commands.exitBlockquote()).toBe(false)
  })
})
