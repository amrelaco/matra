import { describe, expect, it } from 'vitest'
import { blockColor, createEditor, indent, lineHeight, starterKit, textAlign } from './index'
import type { Pos } from './types'

const editorWith = (content: string, types?: readonly string[]) =>
  createEditor({
    extensions: [...starterKit, blockColor(types ?? ['paragraph', 'heading'])] as const,
    content,
  })

describe('blockColor', () => {
  it('colours the block, not the run of text inside it', () => {
    const editor = editorWith('<p>hello</p>')
    editor.commands.select(2 as Pos)
    expect(editor.commands.setBlockBackground('#fdecc8')).toBe(true)
    const html = editor.getHTML()
    // The colour is on the <p>; nothing was wrapped around the words.
    expect(html).toBe(
      '<p style="background-color: #fdecc8" data-block-background="#fdecc8">hello</p>',
    )
    expect(html).not.toContain('<span')
  })

  it('holds a colour on an empty block, which a mark cannot', () => {
    const editor = editorWith('<p></p>')
    editor.commands.select(1 as Pos)
    expect(editor.commands.setBlockBackground('#fdecc8')).toBe(true)
    expect(editor.getHTML()).toContain('background-color: #fdecc8')
  })

  it('keeps text colour and background together on one block', () => {
    const editor = editorWith('<p>hello</p>')
    editor.commands.select(2 as Pos)
    editor.commands.setBlockColor('rgb(212, 76, 71)')
    editor.commands.setBlockBackground('#fdecc8')
    const html = editor.getHTML()
    expect(html).toContain('color: rgb(212, 76, 71)')
    expect(html).toContain('background-color: #fdecc8')
  })

  it('survives a round trip through HTML', () => {
    const editor = editorWith('<p>hello</p>')
    editor.commands.select(2 as Pos)
    editor.commands.setBlockColor('#d44c47')
    const again = editorWith(editor.getHTML())
    expect(again.getJSON().content?.[0]?.attrs?.blockColor).toBe('#d44c47')
  })

  it('refuses a value that is not a colour, rather than dropping it', () => {
    const editor = editorWith('<p>hello</p>')
    editor.commands.select(2 as Pos)
    expect(editor.commands.setBlockColor('red; background: url(x)')).toBe(false)
    expect(editor.commands.setBlockColor('expression(alert(1))')).toBe(false)
    expect(editor.commands.setBlockColor('javascript:alert(1)')).toBe(false)
    expect(editor.getHTML()).toBe('<p>hello</p>')
  })

  it('will not re-say what a block already says, so `can` is honest', () => {
    const editor = editorWith('<p>hello</p>')
    editor.commands.select(2 as Pos)
    expect(editor.commands.setBlockColor('#d44c47')).toBe(true)
    expect(editor.commands.setBlockColor('#d44c47')).toBe(false)
  })

  it('unsets one colour without touching the other', () => {
    const editor = editorWith('<p>hello</p>')
    editor.commands.select(2 as Pos)
    editor.commands.setBlockColor('#d44c47')
    editor.commands.setBlockBackground('#fdecc8')
    expect(editor.commands.unsetBlockBackground()).toBe(true)
    const html = editor.getHTML()
    expect(html).toContain('color: #d44c47')
    expect(html).not.toContain('background-color')
  })

  it('clears both at once', () => {
    const editor = editorWith('<p>hello</p>')
    editor.commands.select(2 as Pos)
    editor.commands.setBlockColor('#d44c47')
    editor.commands.setBlockBackground('#fdecc8')
    expect(editor.commands.unsetBlockColors()).toBe(true)
    expect(editor.getHTML()).toBe('<p>hello</p>')
  })

  it('colours every block the selection covers', () => {
    const editor = editorWith('<p>one</p><p>two</p>')
    editor.commands.select({ from: 1 as Pos, to: 9 as Pos })
    expect(editor.commands.setBlockBackground('#fdecc8')).toBe(true)
    const html = editor.getHTML()
    expect(html.match(/background-color/g)).toHaveLength(2)
  })

  it('travels with the block it is on', () => {
    const editor = editorWith('<p>one</p><p>two</p>')
    editor.commands.select(7 as Pos)
    editor.commands.setBlockBackground('#fdecc8')
    // The second paragraph carries the colour in the document itself.
    expect(editor.getJSON().content?.[1]?.attrs?.blockBackground).toBe('#fdecc8')
    expect(editor.getJSON().content?.[0]?.attrs?.blockBackground ?? null).toBe(null)
  })
})

describe('global attributes that all render a style', () => {
  /*
    A regression test for silent data loss. `withGlobals` composed a global's
    style with the node's own and *assigned* it over any other global's, so of
    the extensions that render a style — alignment, line height, indent and now
    block colour — only the last to run survived into the HTML. Since that HTML
    is what gets stored and parsed back, centring a paragraph and then setting
    its line height lost the centring for good.
  */
  it('keeps all four on one paragraph', () => {
    const editor = createEditor({
      extensions: [...starterKit, textAlign(), lineHeight(), indent(), blockColor()] as const,
      content: '<p>hello</p>',
    })
    editor.commands.select(2 as Pos)
    editor.commands.setTextAlign('center')
    editor.commands.setLineHeight('2')
    editor.commands.indent()
    editor.commands.setBlockBackground('#fdecc8')
    const html = editor.getHTML()
    for (const declaration of [
      'text-align: center',
      'line-height: 2',
      'margin-inline-start',
      'background-color: #fdecc8',
    ]) {
      expect(html).toContain(declaration)
    }
  })
})
