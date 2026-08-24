import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import {
  characterCount,
  highlight,
  image,
  placeholder,
  starterKit,
  subscript,
  superscript,
  tableKit,
  textAlign,
  underline,
} from './extensions'
import type { NodeDef, Pos } from './types'

// Editors are built the way a user builds them — a const tuple — so these
// tests also prove command inference still works for the new extensions.
const HELLO = '<p>hello world</p>'

describe('marks', () => {
  it('toggles underline', () => {
    const editor = createEditor({
      extensions: [...starterKit, underline] as const,
      content: HELLO,
    })
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    expect(editor.commands.toggleUnderline()).toBe(true)
    expect(editor.getHTML()).toContain('<u>hello</u>')
  })

  it('highlights with a colour', () => {
    const editor = createEditor({
      extensions: [...starterKit, highlight] as const,
      content: HELLO,
    })
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleHighlight('yellow')
    expect(editor.getHTML()).toContain('data-color="yellow"')
  })

  it('drops a colour that is not a colour when parsing', () => {
    const editor = createEditor({
      extensions: [...starterKit, highlight] as const,
      content: '<p><mark data-color="url(javascript:alert(1))">x</mark></p>',
    })
    expect(editor.getHTML()).not.toContain('javascript')
  })

  it('will not put text above and below the line at once', () => {
    const editor = createEditor({
      extensions: [...starterKit, subscript, superscript] as const,
      content: HELLO,
    })
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleSubscript()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleSuperscript()
    const html = editor.getHTML()
    expect(html).toContain('<sup>')
    expect(html).not.toContain('<sub>')
  })
})

describe('images', () => {
  it('inserts one with a safe source', () => {
    const editor = createEditor({ extensions: [...starterKit, image] as const, content: HELLO })
    editor.commands.select({ from: 6 as Pos, to: 6 as Pos })
    expect(editor.commands.insertImage({ src: 'https://matrajs.com/a.png', alt: 'a' })).toBe(
      true,
    )
    expect(editor.getHTML()).toContain('src="https://matrajs.com/a.png"')
  })

  it('refuses a javascript: source', () => {
    const editor = createEditor({ extensions: [...starterKit, image] as const, content: HELLO })
    editor.commands.select({ from: 6 as Pos, to: 6 as Pos })
    expect(editor.commands.insertImage({ src: 'javascript:alert(1)' })).toBe(false)
  })

  it('drops an unsafe source when parsing', () => {
    const editor = createEditor({
      extensions: [...starterKit, image] as const,
      content: '<p><img src="javascript:alert(1)"></p>',
    })
    expect(editor.getHTML()).not.toContain('javascript')
  })
})

describe('alignment', () => {
  // Alignment needs a block that declares the attribute, so the paragraph is
  // replaced with one that does — which is how a host app would do it too.
  const alignedParagraph: NodeDef = {
    kind: 'node',
    name: 'paragraph',
    content: 'inline*',
    group: 'block',
    attrs: { textAlign: { default: null } },
    parseDOM: [{ tag: 'p' }],
    toDOM: (node: { attrs?: Record<string, unknown> }) =>
      node.attrs?.textAlign
        ? ['p', { style: `text-align: ${node.attrs.textAlign}` }, 0]
        : ['p', 0],
  }

  const base = starterKit.filter((def) => def.name !== 'paragraph')

  it('sets alignment on a block', () => {
    const editor = createEditor({
      extensions: [...base, alignedParagraph, textAlign()] as const,
      content: '<p>hello</p>',
    })
    editor.commands.select({ from: 2 as Pos, to: 2 as Pos })
    expect(editor.commands.setTextAlign('center')).toBe(true)
    expect(editor.getHTML()).toContain('text-align: center')
  })

  it('refuses an alignment that is not one', () => {
    const editor = createEditor({
      extensions: [...base, alignedParagraph, textAlign()] as const,
      content: '<p>hello</p>',
    })
    expect(editor.commands.setTextAlign('sideways' as never)).toBe(false)
  })
})

describe('tables', () => {
  const tableEditor = () =>
    createEditor({
      extensions: [...starterKit, ...tableKit] as const,
      content: '<p>before</p>',
    })

  it('inserts a table with a header row', () => {
    const editor = tableEditor()
    editor.commands.select({ from: 7 as Pos, to: 7 as Pos })
    expect(editor.commands.insertTable(3, 2)).toBe(true)

    const html = editor.getHTML()
    expect(html).toContain('<table>')
    expect((html.match(/<tr>/g) ?? []).length).toBe(3)
    expect((html.match(/<th>/g) ?? []).length).toBe(2)
    expect((html.match(/<td>/g) ?? []).length).toBe(4)
  })

  it('refuses a table with no cells', () => {
    const editor = tableEditor()
    expect(editor.commands.insertTable(0, 3)).toBe(false)
  })

  it('round-trips a pasted table', () => {
    const editor = createEditor({
      extensions: [...starterKit, ...tableKit] as const,
      content:
        '<table><tbody><tr><th><p>h</p></th></tr><tr><td><p>c</p></td></tr></tbody></table>',
    })
    expect(editor.getHTML()).toContain('<th><p>h</p></th>')
    expect(editor.getHTML()).toContain('<td><p>c</p></td>')
  })

  it('keeps a colspan through a round trip', () => {
    const editor = createEditor({
      extensions: [...starterKit, ...tableKit] as const,
      content: '<table><tbody><tr><td colspan="2"><p>wide</p></td></tr></tbody></table>',
    })
    expect(editor.getHTML()).toContain('colspan="2"')
  })
})

describe('placeholder', () => {
  it('marks an empty editor and clears once there is text', () => {
    const editor = createEditor({
      extensions: [...starterKit, placeholder({ text: 'Write something' })] as const,
      content: '<p></p>',
    })
    const element = document.createElement('div')
    editor.mount(element)
    expect(element.getAttribute('data-placeholder')).toBe('Write something')

    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('x')
    expect(element.hasAttribute('data-placeholder')).toBe(false)
  })
})

describe('character count', () => {
  it('exposes the command', () => {
    const editor = createEditor({
      extensions: [...starterKit, characterCount()] as const,
      content: HELLO,
    })
    expect(typeof editor.commands.countCharacters).toBe('function')
  })

  it('rolls back an edit that breaks the limit', () => {
    const editor = createEditor({
      extensions: [...starterKit, characterCount({ limit: 12 })] as const,
      content: '<p>hello world</p>',
    })
    editor.commands.select({ from: 12 as Pos, to: 12 as Pos })
    editor.commands.insert('!!!!!!')
    expect(editor.getText().length).toBeLessThanOrEqual(12)
  })
})
