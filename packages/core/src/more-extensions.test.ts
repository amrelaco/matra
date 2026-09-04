/**
 * The extensions added in 0.17: text style, search, autolink, details,
 * callouts, emoji, clear formatting, focus, trailing node, YouTube, code
 * highlighting, indent, file handling, table operations — and the two that
 * only started working once attributes could be added to other nodes.
 */
import { describe, expect, it, vi } from 'vitest'
import { createEditor } from './editor'
import {
  assignIds,
  autolink,
  callout,
  characterCount,
  clearFormatting,
  codeHighlight,
  detailsKit,
  emoji,
  fileHandler,
  focus,
  indent,
  mention,
  placeholder,
  search,
  searchEmoji,
  starterKit,
  tableKit,
  textAlign,
  textStyle,
  trailingNode,
  uniqueId,
  youtube,
  youtubeId,
} from './extensions'
import type { AnyDef, DocNode, ExtensionDef, Pos } from './types'

const mount = (editor: { mount(el: HTMLElement): void }) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

/** Put the DOM caret at the end of the last text node inside `selector`. */
const caretAtEndOf = (element: HTMLElement, selector: string) => {
  const blocks = element.querySelectorAll(selector)
  const block = blocks[blocks.length - 1] as HTMLElement
  let last: globalThis.Node = block
  while (last.lastChild) last = last.lastChild
  const range = document.createRange()
  const offset = last.nodeType === 3 ? (last.nodeValue ?? '').length : last.childNodes.length
  range.setStart(last, offset)
  range.collapse(true)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const fireInput = (element: HTMLElement, inputType: string, data: string | null = null) => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'inputType', { value: inputType })
  Object.defineProperty(event, 'data', { value: data })
  Object.defineProperty(event, 'target', { value: element })
  element.dispatchEvent(event)
}

/** Type through the view, so input rules fire the way they do for a person. */
const typeInto = (element: HTMLElement, selector: string, text: string) => {
  for (const character of text) {
    caretAtEndOf(element, selector)
    fireInput(element, 'insertText', character)
  }
}

const press = (element: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  element.dispatchEvent(event)
  return event.defaultPrevented
}

const paste = (
  element: HTMLElement,
  data: { html?: string; text?: string; files?: File[] },
) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? (data.html ?? '') : (data.text ?? '')),
      files: data.files ?? [],
    },
  })
  element.dispatchEvent(event)
  return event.defaultPrevented
}

describe('text style', () => {
  const build = (content = '<p>hello world</p>') =>
    createEditor({ extensions: [...starterKit, textStyle] as const, content })

  it('colours a selection and keeps the colour when a font is added', () => {
    const editor = build()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    expect(editor.commands.setColor('#ff0000')).toBe(true)
    expect(editor.getHTML()).toBe('<p><span style="color: #ff0000">hello</span> world</p>')
    expect(editor.commands.setFontFamily('Georgia, serif')).toBe(true)
    expect(editor.getHTML()).toContain('color: #ff0000; font-family: Georgia, serif')
    expect(editor.commands.unsetColor()).toBe(true)
    expect(editor.getHTML()).toBe(
      '<p><span style="font-family: Georgia, serif">hello</span> world</p>',
    )
    expect(editor.commands.unsetTextStyle()).toBe(true)
    expect(editor.getHTML()).toBe('<p>hello world</p>')
  })

  it('refuses a value that is not a colour', () => {
    const editor = build()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    expect(editor.commands.setColor('url(javascript:alert(1))')).toBe(false)
    expect(editor.commands.setFontSize('12px; background: url(x)')).toBe(false)
    expect(editor.getHTML()).toBe('<p>hello world</p>')
  })

  it('reads a styled span back, and drops what it does not understand', () => {
    const editor = build(
      '<p><span style="color: red; font-size: 14px; background-image: url(x)">hi</span> <span>plain</span></p>',
    )
    expect(editor.getHTML()).toBe(
      '<p><span style="color: red; font-size: 14px">hi</span> plain</p>',
    )
  })

  it('applies to the next typed text when nothing is selected', () => {
    const editor = build()
    editor.commands.select(12 as Pos)
    expect(editor.commands.setColor('blue')).toBe(true)
    expect(editor.isActive('textStyle')).toBe(true)
  })
})

describe('search and replace', () => {
  const kit = [...starterKit, search()] as const
  const build = () =>
    createEditor({
      extensions: kit,
      content: '<p>The quick fox.</p><p>A slow fox, a quick Fox.</p><p>No animals.</p>',
    })
  const state = (editor: ReturnType<typeof build>) =>
    editor.extensionState<{
      matches: { from: number; to: number }[]
      current: number
    }>('search')

  it('finds every match, case-insensitively by default', () => {
    const editor = build()
    expect(editor.commands.setSearch('fox')).toBe(true)
    expect(state(editor)?.matches).toHaveLength(3)
    editor.commands.setSearch({ query: 'fox', caseSensitive: true })
    expect(state(editor)?.matches).toHaveLength(2)
    editor.commands.setSearch({ query: 'quick f.x', regex: true })
    expect(state(editor)?.matches).toHaveLength(2)
    editor.commands.setSearch({ query: 'fo', wholeWord: true })
    expect(state(editor)?.matches).toHaveLength(0)
  })

  it('draws the matches and marks the current one', () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.setSearch('fox')
    expect(element.querySelectorAll('.matra-search-match')).toHaveLength(3)
    expect(editor.commands.nextMatch()).toBe(true)
    expect(state(editor)?.current).toBe(0)
    expect(element.querySelectorAll('.matra-search-current')).toHaveLength(1)
    expect(editor.selection.from).toBe(11)
    editor.commands.nextMatch()
    editor.commands.nextMatch()
    editor.commands.nextMatch()
    expect(state(editor)?.current).toBe(0)
    expect(editor.commands.previousMatch()).toBe(true)
    expect(state(editor)?.current).toBe(2)
  })

  it('replaces the current match, then all of them as one undo step', () => {
    const editor = build()
    editor.commands.setSearch('fox')
    editor.commands.nextMatch()
    expect(editor.commands.replaceMatch('cat')).toBe(true)
    expect(editor.getText()).toContain('quick cat.')
    expect(state(editor)?.matches).toHaveLength(2)
    expect(editor.commands.replaceAllMatches('dog')).toBe(true)
    expect(editor.getText()).toBe('The quick cat.\nA slow dog, a quick dog.\nNo animals.')
    expect(state(editor)?.matches).toHaveLength(0)
    editor.commands.undo()
    expect(editor.getText()).toContain('slow fox')
  })

  it('keeps the matches right while typing elsewhere', () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.setSearch('fox')
    const third = element.children[1] as HTMLElement
    editor.commands.select(1 as Pos)
    editor.commands.insert('Well. ')
    const matches = state(editor)?.matches ?? []
    expect(matches).toHaveLength(3)
    for (const match of matches) {
      expect(editor.getText().slice(0).length).toBeGreaterThan(0)
      const text = (
        editor.unsafe.state as { doc: { textBetween(a: number, b: number): string } }
      ).doc
      expect(text.textBetween(match.from, match.to).toLowerCase()).toBe('fox')
    }
    // The block that was not typed in kept its element.
    expect(element.children[1]).toBe(third)
  })

  it('clears', () => {
    const editor = build()
    editor.commands.setSearch('fox')
    expect(editor.commands.clearSearch()).toBe(true)
    expect(state(editor)?.matches).toHaveLength(0)
    expect(editor.commands.clearSearch()).toBe(false)
  })
})

describe('autolink', () => {
  const build = () =>
    createEditor({ extensions: [...starterKit, autolink()] as const, content: '<p></p>' })

  it('links a URL once a space is typed after it', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'see https://matrajs.com/docs. now')
    expect(editor.getHTML()).toBe(
      '<p>see <a href="https://matrajs.com/docs" target="_blank" rel="noopener noreferrer">https://matrajs.com/docs</a>. now</p>',
    )
  })

  it('makes a www address whole and leaves plain words alone', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'www.example.org and not.this ')
    expect(editor.getHTML()).toContain('href="https://www.example.org"')
    expect(editor.getHTML()).not.toContain('not.this</a>')
  })

  it('links the selection to a pasted URL, or inserts the URL linked', () => {
    const editor = createEditor({
      extensions: [...starterKit, autolink()] as const,
      content: '<p>read this</p>',
    })
    const element = mount(editor)
    editor.commands.select({ from: 6 as Pos, to: 10 as Pos })
    expect(paste(element, { text: 'https://matrajs.com' })).toBe(true)
    expect(editor.getHTML()).toContain('<a href="https://matrajs.com"')
    expect(editor.getText()).toBe('read this')

    editor.commands.select(10 as Pos)
    paste(element, { text: ' https://example.com/a ' })
    expect(editor.getText()).toBe('read thishttps://example.com/a')
    expect(editor.getHTML()).toContain('href="https://example.com/a"')
  })
})

describe('details', () => {
  const build = (content?: string) =>
    createEditor({ extensions: [...starterKit, ...detailsKit] as const, content })

  it('wraps the current block in a toggle with an empty summary', () => {
    const editor = build('<p>body</p>')
    editor.commands.select(2 as Pos)
    expect(editor.commands.insertDetails()).toBe(true)
    const json = editor.getJSON().content?.[0] as DocNode
    expect(json.type).toBe('details')
    expect(json.content?.map((node) => node.type)).toEqual(['detailsSummary', 'paragraph'])
    expect(editor.getHTML()).toBe(
      '<details open="open" class="matra-details"><summary></summary><p>body</p></details>',
    )
    expect(editor.commands.toggleDetails()).toBe(true)
    expect(editor.getHTML()).toContain('<details class="matra-details">')
    expect(editor.commands.unsetDetails()).toBe(true)
    expect(editor.getHTML()).toBe('<p>body</p>')
  })

  it('reads a real <details> element back', () => {
    const editor = build('<details><summary>Title</summary><p>one</p><p>two</p></details>')
    const json = editor.getJSON().content?.[0] as DocNode
    expect(json.attrs?.open).toBe(false)
    expect(json.content).toHaveLength(3)
  })

  it('moves from the summary into the content on Enter', () => {
    const editor = build('<details open><summary>Title</summary><p>body</p></details>')
    const element = mount(editor)
    caretAtEndOf(element, 'summary')
    expect(press(element, 'Enter')).toBe(true)
    // Inside the paragraph, and the summary still whole.
    expect(editor.getHTML()).toContain('<summary>Title</summary><p>body</p>')
    expect(editor.selection.from).toBe(9)
  })

  it('keeps the element in step with the attribute', () => {
    const editor = build('<details open><summary>T</summary><p>b</p></details>')
    const element = mount(editor)
    const dom = element.querySelector('details') as HTMLDetailsElement
    expect(dom.open).toBe(true)
    editor.commands.select(2 as Pos)
    editor.commands.toggleDetails()
    expect(element.querySelector('details')).toBe(dom)
    expect(dom.open).toBe(false)
  })
})

describe('callout', () => {
  const build = (content = '<p>note</p>') =>
    createEditor({ extensions: [...starterKit, callout] as const, content })

  it('wraps, retypes, takes an icon, and lifts back out', () => {
    const editor = build()
    editor.commands.select(2 as Pos)
    expect(editor.commands.toggleCallout('warning')).toBe(true)
    expect(editor.getHTML()).toBe(
      '<div data-callout="warning" class="matra-callout matra-callout-warning"><div class="matra-callout-body"><p>note</p></div></div>',
    )
    expect(editor.commands.setCalloutType('success')).toBe(true)
    expect(editor.commands.setCalloutEmoji('💡')).toBe(true)
    expect(editor.getHTML()).toContain(
      '<span class="matra-callout-icon" contenteditable="false">💡</span>',
    )
    expect(editor.commands.setCalloutEmoji('<img src=x>')).toBe(false)
    expect(editor.commands.toggleCallout()).toBe(true)
    expect(editor.getHTML()).toBe('<p>note</p>')
  })

  it('round-trips through HTML and ignores a type it does not know', () => {
    const editor = build('<div data-callout="evil" data-emoji="🚀"><p>x</p></div>')
    const json = editor.getJSON().content?.[0] as DocNode
    expect(json.type).toBe('callout')
    expect(json.attrs).toEqual({ type: 'info', emoji: '🚀' })
  })
})

describe('emoji', () => {
  it('replaces a shortcode when its closing colon is typed', () => {
    const editor = createEditor({
      extensions: [...starterKit, emoji()] as const,
      content: '<p></p>',
    })
    const element = mount(editor)
    typeInto(element, 'p', 'ship it :rocket: 12:30:')
    expect(editor.getText()).toBe('ship it 🚀 12:30:')
  })

  it('takes emoticons only when asked, and your own codes always', () => {
    const editor = createEditor({
      extensions: [...starterKit, emoji({ emoticons: true, emojis: { matra: 'ম' } })] as const,
      content: '<p></p>',
    })
    const element = mount(editor)
    typeInto(element, 'p', 'ok :) :matra:')
    expect(editor.getText()).toBe('ok 🙂 ম')
  })

  it('searches the table for a picker', () => {
    expect(searchEmoji('roc')[0]).toEqual({ name: 'rocket', emoji: '🚀' })
    expect(searchEmoji(':thumbs', 1)).toHaveLength(1)
  })
})

describe('clear formatting', () => {
  it('strips marks and flattens blocks to paragraphs in one step', () => {
    const editor = createEditor({
      extensions: [...starterKit, clearFormatting] as const,
      content: '<blockquote><h2><strong>Loud</strong> <em>title</em></h2></blockquote>',
    })
    editor.commands.select({ from: 2 as Pos, to: 12 as Pos })
    expect(editor.commands.clearFormatting()).toBe(true)
    expect(editor.getHTML()).toBe('<p>Loud title</p>')
    editor.commands.undo()
    expect(editor.getHTML()).toContain('<blockquote><h2>')
    expect(editor.commands.clearFormatting()).toBe(true)
    expect(editor.commands.clearFormatting()).toBe(false)
  })
})

describe('focus', () => {
  it('marks the block the caret is in, and only that one', () => {
    const editor = createEditor({
      extensions: [...starterKit, focus()] as const,
      content: '<p>one</p><p>two</p>',
    })
    const element = mount(editor)
    editor.commands.select(2 as Pos)
    expect(element.children[0]?.classList.contains('has-focus')).toBe(true)
    expect(element.children[1]?.classList.contains('has-focus')).toBe(false)
    editor.commands.select(7 as Pos)
    expect(element.children[0]?.classList.contains('has-focus')).toBe(false)
    expect(element.children[1]?.classList.contains('has-focus')).toBe(true)
    expect(editor.getHTML()).toBe('<p>one</p><p>two</p>')
  })
})

describe('trailing node', () => {
  it('keeps a paragraph after whatever ends the document', () => {
    const editor = createEditor({
      extensions: [...starterKit, trailingNode()] as const,
      content: '<p>a</p><hr>',
    })
    mount(editor)
    expect(editor.getHTML()).toBe('<p>a</p><hr><p></p>')
    // Put a rule at the very end: the paragraph comes back after it.
    editor.commands.insert({ type: 'horizontalRule' }, 6 as Pos)
    expect(editor.getHTML()).toBe('<p>a</p><hr><p></p><hr><p></p>')
  })
})

describe('youtube', () => {
  it('finds the id in every shape of address', () => {
    for (const source of [
      'dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(youtubeId(source)).toBe('dQw4w9WgXcQ')
    }
    expect(youtubeId('https://evil.example/embed/dQw4w9WgXcQ')).toBeNull()
    expect(youtubeId('javascript:alert(1)')).toBeNull()
  })

  it('embeds on the privacy domain, from the id alone', () => {
    const editor = createEditor({
      extensions: [...starterKit, youtube] as const,
      content: '<p>x</p>',
    })
    expect(
      editor.commands.insertYoutube({
        src: 'https://youtu.be/dQw4w9WgXcQ',
        start: 42,
        width: 320,
      }),
    ).toBe(true)
    const html = editor.getHTML()
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42"')
    expect(html).toContain('width="320"')
    expect(editor.commands.insertYoutube({ src: 'https://evil.example/x' })).toBe(false)
  })

  it('refuses a frame pointing anywhere else, whatever the JSON says', () => {
    const editor = createEditor({ extensions: [...starterKit, youtube] as const })
    editor.setContent({
      type: 'doc',
      content: [{ type: 'youtube', attrs: { src: 'https://evil.example/' } }],
    })
    expect(editor.getHTML()).toContain('youtube-nocookie.com/embed/"')
    const parsed = createEditor({
      extensions: [...starterKit, youtube] as const,
      content:
        '<iframe src="https://evil.example/embed/x"></iframe><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
    })
    expect(parsed.getJSON().content?.filter((node) => node.type === 'youtube')).toHaveLength(1)
  })
})

describe('code highlighting', () => {
  it('colours comments, strings, numbers and keywords without touching the text', () => {
    const editor = createEditor({
      extensions: [...starterKit, codeHighlight()] as const,
      content: '<pre><code>const n = 42 // answer\nreturn "ok"</code></pre>',
    })
    const element = mount(editor)
    const classes = Array.from(element.querySelectorAll('span')).map((span) => span.className)
    expect(classes).toContain('matra-token-keyword')
    expect(classes).toContain('matra-token-number')
    expect(classes).toContain('matra-token-comment')
    expect(classes).toContain('matra-token-string')
    expect(editor.getHTML()).toBe('<pre><code>const n = 42 // answer\nreturn "ok"</code></pre>')
  })

  it('takes your own tokeniser and survives it throwing', () => {
    const highlight = vi.fn(() => {
      throw new Error('no')
    })
    const editor = createEditor({
      extensions: [...starterKit, codeHighlight({ highlight })] as const,
      content: '<pre><code>x</code></pre>',
    })
    expect(() => mount(editor)).not.toThrow()
    expect(highlight).toHaveBeenCalled()
  })
})

describe('indent', () => {
  it('moves a paragraph in and out with Tab, and stays out of lists', () => {
    const editor = createEditor({
      extensions: [...starterKit, indent()] as const,
      content: '<ul><li><p>item</p></li></ul><p>text</p>',
    })
    const element = mount(editor)
    editor.commands.select(12 as Pos)
    expect(editor.commands.indent()).toBe(true)
    expect(editor.getHTML()).toContain(
      '<p data-indent="1" style="margin-inline-start: 2em">text</p>',
    )
    expect(editor.commands.indent()).toBe(true)
    expect(editor.commands.outdent()).toBe(true)
    expect(editor.commands.setIndent(0)).toBe(true)
    expect(editor.getHTML()).toContain('<p>text</p>')

    caretAtEndOf(element, 'p')
    press(element, 'Tab')
    expect(editor.getHTML()).toContain('<p data-indent="1"')

    editor.commands.select(3 as Pos)
    expect(editor.commands.indent()).toBe(false)
  })

  it('reads the level back from HTML and caps it', () => {
    const editor = createEditor({
      extensions: [...starterKit, indent({ max: 3 })] as const,
      content: '<p data-indent="9">deep</p>',
    })
    expect(editor.getJSON().content?.[0]?.attrs?.indent).toBe(3)
  })
})

describe('file handler', () => {
  it('hands pasted and dropped files over, with a marker for later', () => {
    const onPaste = vi.fn()
    const onDrop = vi.fn()
    const editor = createEditor({
      extensions: [
        ...starterKit,
        fileHandler({ accept: ['image/'], onPaste, onDrop }),
      ] as const,
      content: '<p>text</p>',
    })
    const element = mount(editor)
    const image = new File(['x'], 'a.png', { type: 'image/png' })
    const other = new File(['x'], 'a.txt', { type: 'text/plain' })

    expect(paste(element, { files: [image, other], text: '' })).toBe(true)
    expect(onPaste).toHaveBeenCalledTimes(1)
    const event = onPaste.mock.calls[0]?.[0] as {
      files: File[]
      marker: { map(p: number): number }
    }
    expect(event.files).toEqual([image])
    // The marker follows an edit made while the upload would be running.
    editor.commands.select(1 as Pos)
    editor.commands.insert('12')
    expect(event.marker.map(3)).toBe(5)

    expect(paste(element, { files: [other], text: '' })).toBe(true)
    expect(onPaste).toHaveBeenCalledTimes(1)

    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(drop, 'dataTransfer', {
      value: { files: [image], getData: () => '' },
    })
    element.dispatchEvent(drop)
    expect(onDrop).toHaveBeenCalledTimes(1)
    expect(drop.defaultPrevented).toBe(true)
  })

  it('lets an extension claim a paste before it is parsed', () => {
    const claim: ExtensionDef = {
      kind: 'extension',
      name: 'claim',
      handlePaste: (ctx, data) => (data.text === 'magic' ? ctx.insert('✨') : false),
    }
    const editor = createEditor({
      extensions: [...starterKit, claim] as const,
      content: '<p></p>',
    })
    const element = mount(editor)
    editor.commands.select(1 as Pos)
    paste(element, { text: 'magic' })
    expect(editor.getText()).toBe('✨')
    paste(element, { text: 'plain' })
    expect(editor.getText()).toBe('✨plain')
  })
})

describe('table operations', () => {
  const kit = [...starterKit, ...tableKit] as const
  const build = (content?: string) => createEditor({ extensions: kit, content })
  const shape = (editor: ReturnType<typeof build>) =>
    ((editor.getJSON().content ?? []).find((node) => node.type === 'table')?.content ?? []).map(
      (row) =>
        (row.content ?? []).map(
          (cell) =>
            `${cell.type === 'tableHeader' ? 'h' : 'c'}${cell.attrs?.colspan ?? 1}${cell.attrs?.rowspan ?? 1}`,
        ),
    )

  it('adds and removes rows and columns around the caret', () => {
    const editor = build('<p>x</p>')
    editor.commands.select(1 as Pos)
    expect(editor.commands.insertTable(2, 2)).toBe(true)
    expect(shape(editor)).toEqual([
      ['h11', 'h11'],
      ['c11', 'c11'],
    ])
    // The caret landed in the first cell.
    expect(editor.isActive('tableHeader')).toBe(true)
    expect(editor.commands.addRowAfter()).toBe(true)
    expect(shape(editor)).toEqual([
      ['h11', 'h11'],
      ['c11', 'c11'],
      ['c11', 'c11'],
    ])
    expect(editor.commands.addColumnAfter()).toBe(true)
    expect(shape(editor)).toEqual([
      ['h11', 'h11', 'h11'],
      ['c11', 'c11', 'c11'],
      ['c11', 'c11', 'c11'],
    ])
    expect(editor.commands.addColumnBefore()).toBe(true)
    expect(editor.commands.deleteColumn()).toBe(true)
    expect(shape(editor)[0]).toHaveLength(3)
    expect(editor.commands.toggleHeaderRow()).toBe(true)
    expect(shape(editor)[0]).toEqual(['c11', 'c11', 'c11'])
    expect(editor.commands.toggleHeaderRow()).toBe(true)
    expect(shape(editor)[0]).toEqual(['h11', 'h11', 'h11'])
    expect(editor.commands.addRowBefore()).toBe(true)
    expect(shape(editor)).toHaveLength(4)
    expect(editor.commands.deleteRow()).toBe(true)
    expect(shape(editor)).toHaveLength(3)
    editor.commands.select(1 as Pos)
    expect(editor.commands.addRowAfter()).toBe(false)
  })

  it('widens a spanning cell instead of cutting it', () => {
    const editor = build(
      '<table><tr><td colspan="2"><p>wide</p></td><td><p>c</p></td></tr><tr><td><p>a</p></td><td><p>b</p></td><td rowspan="2"><p>tall</p></td></tr><tr><td><p>d</p></td><td><p>e</p></td></tr></table>',
    )
    // Into "a", the first cell of the second row.
    editor.commands.select(20 as Pos)
    expect(editor.isActive('tableCell')).toBe(true)
    expect(editor.commands.addColumnAfter()).toBe(true)
    expect(shape(editor)).toEqual([
      ['c31', 'c11'],
      ['c11', 'c11', 'c11', 'c12'],
      ['c11', 'c11', 'c11'],
    ])
    expect(editor.commands.addRowAfter()).toBe(true)
    expect(shape(editor)).toEqual([
      ['c31', 'c11'],
      ['c11', 'c11', 'c11', 'c13'],
      ['c11', 'c11', 'c11'],
      ['c11', 'c11', 'c11'],
    ])
    expect(editor.commands.deleteRow()).toBe(true)
    expect(shape(editor)).toEqual([
      ['c31', 'c11'],
      ['c11', 'c11', 'c11', 'c12'],
      ['c11', 'c11', 'c11'],
    ])
  })

  it('moves between cells with Tab and grows the table at the end', () => {
    const editor = build('<p>x</p>')
    editor.commands.select(1 as Pos)
    editor.commands.insertTable(1, 2)
    const first = editor.selection.from
    expect(editor.commands.goToNextCell()).toBe(true)
    expect(editor.selection.from).toBeGreaterThan(first)
    expect(editor.commands.goToPreviousCell()).toBe(true)
    expect(editor.selection.from).toBe(first)
    expect(editor.commands.goToPreviousCell()).toBe(false)
    editor.commands.goToNextCell()
    expect(editor.commands.goToNextCell()).toBe(true)
    expect(shape(editor)).toHaveLength(2)
    expect(editor.isActive('tableCell')).toBe(true)
  })

  it('binds Tab in the view', () => {
    const editor = build('<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table>')
    const element = mount(editor)
    const cell = element.querySelector('td p') as HTMLElement
    const range = document.createRange()
    range.setStart(cell.firstChild as Text, 1)
    range.collapse(true)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    expect(press(element, 'Tab')).toBe(true)
    expect(editor.selection.from).toBe(9)
  })

  it('deletes the table when the last row or column goes', () => {
    const editor = build('<p>x</p><table><tr><td><p>only</p></td></tr></table>')
    editor.commands.select(6 as Pos)
    expect(editor.commands.deleteColumn()).toBe(true)
    expect(editor.getHTML()).toBe('<p>x</p>')
  })
})

describe('attributes added to other nodes', () => {
  it('lets textAlign work on the paragraph in the box', () => {
    const editor = createEditor({
      extensions: [...starterKit, textAlign()] as const,
      content: '<p>centred</p><p style="text-align: right">right</p>',
    })
    editor.commands.select(2 as Pos)
    expect(editor.commands.setTextAlign('center')).toBe(true)
    expect(editor.getHTML()).toBe(
      '<p style="text-align: center">centred</p><p style="text-align: right">right</p>',
    )
    expect(editor.commands.unsetTextAlign()).toBe(true)
    expect(editor.getHTML()).toBe('<p>centred</p><p style="text-align: right">right</p>')
  })

  it('does not render an attribute twice on a node that declares it itself', () => {
    const aligned: AnyDef = {
      kind: 'node',
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      attrs: { textAlign: { default: null } },
      parseDOM: [{ tag: 'p' }],
      toDOM: (node) =>
        node.attrs?.textAlign
          ? ['p', { style: `text-align: ${node.attrs.textAlign}` }, 0]
          : ['p', 0],
    }
    const editor = createEditor({
      extensions: [
        ...starterKit.filter((def) => def.name !== 'paragraph'),
        aligned,
        textAlign(),
      ],
      content: '<p>x</p>',
    })
    editor.commands.select(1 as Pos)
    ;(editor.commands as { setTextAlign(a: string): boolean }).setTextAlign('center')
    expect(editor.getHTML()).toBe('<p style="text-align: center">x</p>')
  })

  it('keeps unique ids through HTML', () => {
    const editor = createEditor({ extensions: [...starterKit, uniqueId()] as const })
    editor.setContent(
      assignIds(
        {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
        },
        { generate: () => 'p-1' },
      ),
    )
    expect(editor.getHTML()).toBe('<p data-id="p-1">a</p>')
    const again = createEditor({
      extensions: [...starterKit, uniqueId()] as const,
      content: editor.getHTML(),
    })
    expect(again.getJSON().content?.[0]?.attrs?.id).toBe('p-1')
  })

  it("composes a global style with the node's own", () => {
    const tint: ExtensionDef<{ tint: (ctx: import('./types').Ctx, color: string) => boolean }> =
      {
        kind: 'extension',
        name: 'tint',
        attributes: [
          {
            types: ['tableCell'],
            attrs: { tint: { render: (value) => ({ style: `background: ${String(value)}` }) } },
          },
        ],
        commands: { tint: (ctx, color) => ctx.setNodeAttrs('tableCell', { tint: color }) },
      }
    const editor = createEditor({
      extensions: [...starterKit, ...tableKit, tint] as const,
      content: '<table><tr><td data-colwidth="100"><p>a</p></td></tr></table>',
    })
    editor.commands.select(4 as Pos)
    expect(editor.commands.tint('yellow')).toBe(true)
    expect(editor.getHTML()).toContain('style="width: 100px; background: yellow"')
  })
})

describe('placeholder in every block', () => {
  it('prompts inside the empty block the caret is in, once the document has text', () => {
    const editor = createEditor({
      extensions: [...starterKit, placeholder({ text: 'Type…', everyBlock: true })] as const,
      content: '<p>text</p><p></p>',
    })
    const element = mount(editor)
    editor.commands.select(7 as Pos)
    expect(element.children[1]?.getAttribute('data-placeholder')).toBe('Type…')
    expect(element.hasAttribute('data-placeholder')).toBe(false)
    editor.commands.select(1 as Pos)
    expect(element.children[1]?.hasAttribute('data-placeholder')).toBe(false)
  })
})

describe('character count', () => {
  it('counts words across blocks and only recounts when the text changes', () => {
    const editor = createEditor({
      extensions: [...starterKit, characterCount()] as const,
      content: '<p>hello</p><p>world again</p>',
    })
    const before = editor.extensionState<{ characters: number; words: number }>(
      'characterCount',
    )
    expect(before).toEqual({ characters: 16, words: 3 })
    editor.commands.select(2 as Pos)
    expect(editor.extensionState('characterCount')).toBe(before)
    editor.commands.insert('!')
    expect(editor.extensionState('characterCount')).toEqual({ characters: 17, words: 3 })
  })
})

describe('mentions render their label as text', () => {
  it('in HTML and in the DOM', () => {
    const editor = createEditor({
      extensions: [...starterKit, mention()] as const,
      content: '<p></p>',
    })
    const element = mount(editor)
    editor.commands.insertMention({ id: 'u1', label: 'Nahim' })
    expect(editor.getHTML()).toContain('>@Nahim</span>')
    expect(element.querySelector('.matra-mention')?.textContent).toBe('@Nahim')
    expect(element.querySelector('.matra-mention')?.children).toHaveLength(0)
  })
})
