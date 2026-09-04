/**
 * The layout extensions: invisible characters, columns, page breaks and line
 * height — two that draw over the document, one that restructures it, and one
 * that puts an attribute on blocks defined elsewhere.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import { columnsKit } from './extensions/columns'
import { invisibleCharacters } from './extensions/invisible-characters'
import { lineHeight, lineHeightOf } from './extensions/line-height'
import { pageBreak } from './extensions/page-break'
import type { DocNode, Pos } from './types'

const mount = (editor: { mount(el: HTMLElement): void }) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

describe('invisible characters', () => {
  const build = (content = '<p>a b</p>', options?: { visible?: boolean }) =>
    createEditor({
      extensions: [...starterKit, invisibleCharacters(options)] as const,
      content,
    })
  const state = (editor: ReturnType<typeof build>) =>
    editor.extensionState<{ visible: boolean }>('invisibleCharacters')

  it('is hidden until asked, unless asked at the start', () => {
    const editor = build()
    const element = mount(editor)
    expect(state(editor)?.visible).toBe(false)
    expect(element.querySelector('.matra-invisible-space')).toBeNull()
    expect(element.querySelector('.matra-invisible-paragraph')).toBeNull()
    // Nothing to hide, so nothing happened.
    expect(editor.commands.hideInvisibleCharacters()).toBe(false)
    expect(editor.can.showInvisibleCharacters()).toBe(true)

    const shown = build('<p>a b</p>', { visible: true })
    const shownElement = mount(shown)
    expect(state(shown)?.visible).toBe(true)
    expect(shownElement.querySelectorAll('.matra-invisible-space')).toHaveLength(1)
  })

  it('draws a dot per space, a pilcrow per block and an arrow per break', () => {
    const editor = build('<p>one two</p><p>a<br>b</p><p>x&nbsp;y</p>')
    const element = mount(editor)
    expect(editor.commands.toggleInvisibleCharacters()).toBe(true)
    expect(state(editor)?.visible).toBe(true)

    expect(element.querySelectorAll('.matra-invisible-space')).toHaveLength(2)
    expect(element.querySelectorAll('.matra-invisible-paragraph')).toHaveLength(3)
    expect(element.querySelectorAll('.matra-invisible-break')).toHaveLength(1)

    const marker = element.querySelector('.matra-invisible-paragraph') as HTMLElement
    expect(marker.textContent).toBe('¶')
    expect(marker.getAttribute('contenteditable')).toBe('false')
    expect(marker.getAttribute('aria-hidden')).toBe('true')
    // The pilcrow closes the block: none of the paragraph's text follows it.
    const first = element.querySelector('p') as HTMLElement
    expect(first.lastElementChild).toBe(marker)
    // The arrow sits after the break and before the text that follows it.
    const second = element.querySelectorAll('p')[1] as HTMLElement
    expect(second.textContent).toBe('a↵b¶')

    expect(editor.commands.toggleInvisibleCharacters()).toBe(true)
    expect(state(editor)?.visible).toBe(false)
    expect(element.querySelector('.matra-invisible-space')).toBeNull()
    expect(element.querySelector('.matra-invisible-paragraph')).toBeNull()
  })

  it('keeps the markers in place while typing', () => {
    const editor = build('<p>hello world</p>')
    const element = mount(editor)
    expect(editor.commands.showInvisibleCharacters()).toBe(true)
    expect(editor.commands.showInvisibleCharacters()).toBe(false)

    editor.commands.insert('Well, ', 1 as Pos)
    const paragraph = element.querySelector('p') as HTMLElement
    expect(paragraph.textContent).toBe('Well, hello world¶')
    expect(paragraph.lastElementChild?.className).toBe('matra-invisible-paragraph')
    const dots = paragraph.querySelectorAll('.matra-invisible-space')
    expect(dots).toHaveLength(2)
    // Each dot sits on a space and on nothing else.
    for (const dot of Array.from(dots)) expect(dot.textContent).toBe(' ')

    editor.commands.insert(' again', 18 as Pos)
    expect(paragraph.textContent).toBe('Well, hello world again¶')
    expect(paragraph.querySelectorAll('.matra-invisible-space')).toHaveLength(3)
  })

  it('never reaches the document', () => {
    const editor = build('<p>a b</p><p>c<br>d</p>')
    mount(editor)
    editor.commands.showInvisibleCharacters()
    expect(editor.getHTML()).toBe('<p>a b</p><p>c<br>d</p>')
    const json = JSON.stringify(editor.getJSON())
    expect(json).not.toContain('¶')
    expect(json).not.toContain('↵')
    expect(json).not.toContain('matra-invisible')
    // A hard break is a break inside the block, not a block of its own.
    expect(editor.getText()).toBe('a b\ncd')
  })
})

describe('columns', () => {
  const kit = [...starterKit, ...columnsKit] as const
  const build = (content = '<p>hello</p>') => createEditor({ extensions: kit, content })
  const list = '<div data-columns="" class="matra-columns">'
  const col = (inner: string) => `<div data-column="" class="matra-column">${inner}</div>`
  const columnsOf = (editor: ReturnType<typeof build>) =>
    ((editor.getJSON().content ?? []).find((node) => node.type === 'columnList')?.content ?? [])
      .length

  it('wraps the block at the caret into columns and keeps the caret in it', () => {
    const editor = build()
    editor.commands.select(3 as Pos)
    expect(editor.commands.setColumns()).toBe(true)
    expect(editor.getHTML()).toBe(`${list}${col('<p>hello</p>')}${col('<p></p>')}</div>`)
    expect(editor.selection.from).toBe(5)
    editor.commands.insert('X')
    expect(editor.getText()).toBe('heXllo')
    // Already in columns: no columns inside columns.
    expect(editor.commands.setColumns(3)).toBe(false)
  })

  it('takes a count between two and six, and nothing else', () => {
    for (const count of [1, 7, 0, -2, 2.5, Number.NaN]) {
      const editor = build()
      expect(editor.commands.setColumns(count)).toBe(false)
      expect(editor.getHTML()).toBe('<p>hello</p>')
    }
    const editor = build()
    expect(editor.commands.setColumns(6)).toBe(true)
    expect(columnsOf(editor)).toBe(6)
  })

  it('wraps a whole block that is not a paragraph', () => {
    const editor = build('<ul><li><p>one</p></li></ul>')
    editor.commands.select(5 as Pos)
    expect(editor.commands.setColumns(2)).toBe(true)
    expect(editor.getHTML()).toBe(
      `${list}${col('<ul><li><p>one</p></li></ul>')}${col('<p></p>')}</div>`,
    )
    editor.commands.insert('!')
    expect(editor.getText()).toBe('on!e')
  })

  it('adds a column at the end and moves into it, up to six', () => {
    const editor = build()
    editor.commands.select(1 as Pos)
    editor.commands.setColumns(2)
    expect(editor.commands.addColumn()).toBe(true)
    expect(columnsOf(editor)).toBe(3)
    editor.commands.insert('third')
    expect(editor.getHTML()).toBe(
      `${list}${col('<p>hello</p>')}${col('<p></p>')}${col('<p>third</p>')}</div>`,
    )
    expect(editor.commands.addColumn()).toBe(true)
    expect(editor.commands.addColumn()).toBe(true)
    expect(editor.commands.addColumn()).toBe(true)
    expect(columnsOf(editor)).toBe(6)
    expect(editor.commands.addColumn()).toBe(false)
    // Outside any list there is nothing to add to.
    expect(build().commands.addColumn()).toBe(false)
  })

  it('deletes the column the caret is in', () => {
    const editor = build(`${list}${col('<p>a</p>')}${col('<p>b</p>')}${col('<p>c</p>')}</div>`)
    // Into "b": list 0, column 1, paragraph 2, "a" 3, column 6, paragraph 7, "b" 8.
    editor.commands.select(8 as Pos)
    expect(editor.commands.removeColumn()).toBe(true)
    expect(editor.getHTML()).toBe(`${list}${col('<p>a</p>')}${col('<p>c</p>')}</div>`)
    // The caret landed in the column that took its place.
    editor.commands.insert('!')
    expect(editor.getText()).toBe('a\n!c')

    // The last column: the caret falls back into the one before it.
    editor.commands.select(9 as Pos)
    expect(editor.commands.removeColumn()).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p>')
    expect(build().commands.removeColumn()).toBe(false)
  })

  it('drops the list when one column would remain, keeping its blocks', () => {
    const editor = build(`${list}${col('<p>a</p>')}${col('<p>b</p><p>c</p>')}</div>`)
    editor.commands.select(3 as Pos)
    expect(editor.commands.removeColumn()).toBe(true)
    expect(editor.getHTML()).toBe('<p>b</p><p>c</p>')
    editor.commands.insert('!')
    expect(editor.getText()).toBe('!b\nc')
  })

  it('unsets back to the blocks in order, with the caret where it was', () => {
    const editor = build(
      `${list}${col('<p>a</p>')}${col('<p>bc</p>')}${col('<ul><li><p>d</p></li></ul><p>e</p>')}</div>`,
    )
    // Between "b" and "c".
    editor.commands.select(9 as Pos)
    expect(editor.commands.unsetColumns()).toBe(true)
    expect(editor.getHTML()).toBe('<p>a</p><p>bc</p><ul><li><p>d</p></li></ul><p>e</p>')
    editor.commands.insert('X')
    expect(editor.getText()).toBe('a\nbXc\nd\ne')
    expect(editor.commands.unsetColumns()).toBe(false)
  })

  it('round-trips through HTML', () => {
    const source = `${list}${col('<p>a</p>')}${col('<p>b</p><p>c</p>')}</div>`
    const editor = build(source)
    expect(editor.getHTML()).toBe(source)
    // Without the classes too: the data attributes are what the parser reads.
    const bare = build(
      '<div data-columns><div data-column><p>x</p></div><div data-column><p>y</p></div></div>',
    )
    expect(bare.getHTML()).toBe(`${list}${col('<p>x</p>')}${col('<p>y</p>')}</div>`)
    expect(build(bare.getHTML()).getJSON()).toEqual(bare.getJSON())
  })

  it('round-trips through JSON', () => {
    const doc: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'columnList',
          content: [
            {
              type: 'column',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
            {
              type: 'column',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
                { type: 'paragraph' },
              ],
            },
          ],
        },
      ],
    }
    const editor = build()
    editor.setContent(doc)
    expect(editor.getJSON()).toEqual(doc)
    expect(editor.getHTML()).toBe(`${list}${col('<p>a</p>')}${col('<p>b</p><p></p>')}</div>`)
  })
})

describe('page break', () => {
  const kit = [...starterKit, pageBreak] as const
  const build = (content?: string) => createEditor({ extensions: kit, content })
  const rendered =
    '<div data-page-break="" class="matra-page-break" contenteditable="false"></div>'

  it('splits the paragraph the caret is in', () => {
    const editor = build('<p>before after</p>')
    editor.commands.select(7 as Pos)
    expect(editor.can.insertPageBreak()).toBe(true)
    expect(editor.getHTML()).toBe('<p>before after</p>')
    expect(editor.commands.insertPageBreak()).toBe(true)
    expect(editor.getHTML()).toBe(`<p>before</p>${rendered}<p> after</p>`)
    // The caret lands after the break, ready to keep typing.
    expect(editor.selection.from).toBe(10)
    // At the end of the document a paragraph is left to type in.
    editor.commands.select(16 as Pos)
    editor.commands.insertPageBreak()
    expect(editor.getHTML()).toBe(`<p>before</p>${rendered}<p> after</p>${rendered}<p></p>`)
  })

  it('round-trips through JSON and HTML', () => {
    const doc: DocNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
        { type: 'pageBreak' },
        { type: 'paragraph', content: [{ type: 'text', text: 'two' }] },
      ],
    }
    const editor = build()
    editor.setContent(doc)
    expect(editor.getJSON()).toEqual(doc)
    expect(editor.getHTML()).toBe(`<p>one</p>${rendered}<p>two</p>`)
    expect(build(editor.getHTML()).getJSON()).toEqual(doc)
    expect(build('<p>a</p><div data-page-break></div><p>b</p>').getJSON().content?.[1]).toEqual(
      {
        type: 'pageBreak',
      },
    )
  })
})

describe('line height', () => {
  const build = (content = '<p>x</p>', types?: readonly string[]) =>
    createEditor({ extensions: [...starterKit, lineHeight(types)] as const, content })

  it('sets and unsets on the block at the caret', () => {
    const editor = build()
    editor.commands.select(1 as Pos)
    expect(editor.commands.setLineHeight(1.5)).toBe(true)
    expect(editor.getHTML()).toBe('<p style="line-height: 1.5">x</p>')
    expect(editor.getJSON().content?.[0]?.attrs?.lineHeight).toBe('1.5')
    // The same again is not a change.
    expect(editor.commands.setLineHeight('1.5')).toBe(false)
    expect(editor.commands.setLineHeight('28px')).toBe(true)
    expect(editor.getHTML()).toBe('<p style="line-height: 28px">x</p>')
    expect(editor.commands.unsetLineHeight()).toBe(true)
    expect(editor.getHTML()).toBe('<p>x</p>')
    expect(editor.commands.unsetLineHeight()).toBe(false)
  })

  it('round-trips through HTML, on the types it was given', () => {
    const editor = build(
      '<p style="line-height: 1.5">a</p><h2 style="line-height: 150%">b</h2>',
    )
    expect(editor.getHTML()).toBe(
      '<p style="line-height: 1.5">a</p><h2 style="line-height: 150%">b</h2>',
    )
    const only = build('<p style="line-height: 2em">a</p><h2 style="line-height: 2em">b</h2>', [
      'paragraph',
    ])
    expect(only.getHTML()).toBe('<p style="line-height: 2em">a</p><h2>b</h2>')
  })

  it('refuses anything that is not a line height, wherever it comes from', () => {
    const editor = build()
    editor.commands.select(1 as Pos)
    for (const value of [
      'url(x)',
      '1; color: red',
      '1.5px; background: url(x)',
      '1.5 ',
      -1,
      Number.NaN,
      'auto',
      '',
    ]) {
      expect(editor.commands.setLineHeight(value)).toBe(false)
    }
    expect(editor.getHTML()).toBe('<p>x</p>')
    expect(lineHeightOf('1; color: red')).toBeNull()
    expect(lineHeightOf('1.25rem')).toBe('1.25rem')

    // A value smuggled in through JSON never reaches the element either.
    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { lineHeight: 'url(x)' },
          content: [{ type: 'text', text: 'x' }],
        },
      ],
    })
    expect(editor.getHTML()).toBe('<p>x</p>')
    // And one parsed out of a style with other declarations keeps only its own.
    expect(build('<p style="line-height: 1; color: red">x</p>').getHTML()).toBe(
      '<p style="line-height: 1">x</p>',
    )
  })

  it('applies to every block in the selection', () => {
    const editor = build('<p>a</p><p>b</p><p>c</p>')
    editor.commands.select({ from: 1 as Pos, to: 5 as Pos })
    expect(editor.commands.setLineHeight(2)).toBe(true)
    expect(editor.getHTML()).toBe(
      '<p style="line-height: 2">a</p><p style="line-height: 2">b</p><p>c</p>',
    )
    // The selection is where it was.
    expect(editor.selection.from).toBe(1)
    expect(editor.selection.to).toBe(5)
  })
})
