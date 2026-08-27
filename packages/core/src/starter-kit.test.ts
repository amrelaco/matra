import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

const editorWith = (content = '<p>hello</p>') =>
  createEditor({ extensions: starterKit, content })

describe('starter kit', () => {
  it('exposes every command in the kit', () => {
    const editor = editorWith()
    for (const name of [
      'toggleBold',
      'toggleItalic',
      'toggleStrike',
      'toggleCode',
      'setLink',
      'unsetLink',
      'setHeading',
      'toggleHeading',
      'toggleBlockquote',
      'toggleCodeBlock',
      'toggleBulletList',
      'toggleOrderedList',
      'splitListItem',
      'insertHorizontalRule',
      'insertHardBreak',
      'undo',
      'redo',
    ]) {
      expect(typeof (editor.commands as unknown as Record<string, unknown>)[name]).toBe(
        'function',
      )
    }
  })

  it('promotes a paragraph to a heading and back', () => {
    const editor = editorWith()
    editor.commands.select({ from: 2 as Pos, to: 2 as Pos })
    expect(editor.commands.toggleHeading(2)).toBe(true)
    expect(editor.getHTML()).toBe('<h2>hello</h2>')
    editor.commands.toggleHeading(2)
    expect(editor.getHTML()).toBe('<p>hello</p>')
  })

  it('wraps and unwraps a blockquote', () => {
    const editor = editorWith()
    editor.commands.select({ from: 2 as Pos, to: 2 as Pos })
    editor.commands.toggleBlockquote()
    expect(editor.getHTML()).toBe('<blockquote><p>hello</p></blockquote>')
    editor.commands.toggleBlockquote()
    expect(editor.getHTML()).toBe('<p>hello</p>')
  })

  it('builds a list and indents an item through the engine bridge', () => {
    const editor = createEditor({
      extensions: starterKit,
      content: '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
    })
    // Cursor inside the second item's paragraph (doc position, not text offset).
    editor.commands.select({ from: 11 as Pos, to: 11 as Pos })
    expect(editor.commands.sinkListItem()).toBe(true)
    expect(editor.getHTML()).toContain('<ul><li><p>one</p><ul>')
  })

  it('undoes a command as one step', () => {
    const editor = editorWith()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleBold()
    expect(editor.getHTML()).toContain('<strong>')
    expect(editor.commands.undo()).toBe(true)
    expect(editor.getHTML()).toBe('<p>hello</p>')
  })

  it('refuses a javascript: link', () => {
    const editor = editorWith()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    expect(editor.commands.setLink({ href: 'javascript:alert(1)' })).toBe(false)
    expect(editor.commands.setLink({ href: 'https://matrajs.com' })).toBe(true)
    expect(editor.getHTML()).toContain('href="https://matrajs.com"')
  })

  it('drops a javascript: href when parsing pasted HTML', () => {
    const editor = createEditor({
      extensions: starterKit,
      content: '<p><a href="javascript:alert(1)">click</a></p>',
    })
    expect(editor.getHTML()).not.toContain('javascript:')
  })
})
