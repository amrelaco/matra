/**
 * The scholarly extensions: case transforms, formulas and footnotes.
 */
import { describe, expect, it, vi } from 'vitest'
import { createEditor } from './editor'
import { NodeSelection } from './engine/state'
import { footnotesCSS, footnotesKit } from './extensions/footnotes'
import { mathCSS, mathKit } from './extensions/math'
import { mention } from './extensions/mention'
import { starterKit } from './extensions/starter-kit'
import { textTransform } from './extensions/text-transform'
import { engine } from './internal'
import type { Command, DocNode, ExtensionDef, Pos } from './types'

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

const types = (editor: { getJSON(): DocNode }) =>
  editor.getJSON().content?.map((node) => node.type) ?? []

/** What a click on an atom does: a node selection on the node at a position. */
const selectNode: ExtensionDef<{ selectNodeAt: Command<[pos: number]> }> = {
  kind: 'extension',
  name: 'selectNode',
  commands: {
    selectNodeAt: (ctx, pos) => {
      const { tr } = engine(ctx)
      tr.setSelection(NodeSelection.create(tr.doc, pos))
      return true
    },
  },
}

describe('text transform', () => {
  const build = (content: string) =>
    createEditor({ extensions: [...starterKit, textTransform] as const, content })

  it('changes the case of the selection, every way', () => {
    const editor = build('<p>hello world. how are you? fine</p>')
    editor.commands.select({ from: 1 as Pos, to: 31 as Pos })
    expect(editor.commands.uppercase()).toBe(true)
    expect(editor.getText()).toBe('HELLO WORLD. HOW ARE YOU? FINE')
    expect(editor.selection).toMatchObject({ from: 1, to: 31 })
    expect(editor.commands.lowercase()).toBe(true)
    expect(editor.getText()).toBe('hello world. how are you? fine')
    expect(editor.commands.capitalize()).toBe(true)
    expect(editor.getText()).toBe('Hello World. How Are You? Fine')
    expect(editor.commands.sentenceCase()).toBe(true)
    expect(editor.getText()).toBe('Hello world. How are you? Fine')
    expect(editor.commands.toggleCase()).toBe(true)
    expect(editor.getText()).toBe('HELLO WORLD. HOW ARE YOU? FINE')
    expect(editor.commands.toggleCase()).toBe(true)
    expect(editor.getText()).toBe('hello world. how are you? fine')
  })

  it('knows what a word is', () => {
    const editor = build("<p>don't stop 3rd o'clock</p>")
    editor.commands.select({ from: 1 as Pos, to: 23 as Pos })
    expect(editor.commands.capitalize()).toBe(true)
    expect(editor.getText()).toBe("Don't Stop 3rd O'clock")
    expect(editor.commands.sentenceCase()).toBe(true)
    expect(editor.getText()).toBe("Don't stop 3rd o'clock")
  })

  it('keeps the marks', () => {
    const editor = build('<p>hello <strong>bold</strong> world</p>')
    editor.commands.select({ from: 1 as Pos, to: 17 as Pos })
    expect(editor.commands.uppercase()).toBe(true)
    expect(editor.getHTML()).toBe('<p>HELLO <strong>BOLD</strong> WORLD</p>')
  })

  it('works on the word under the caret when nothing is selected', () => {
    const editor = createEditor({
      extensions: [...starterKit, textTransform, mention()] as const,
      content: '<p>hello <span data-mention-id="u1">@x</span> there</p>',
    })
    editor.commands.select(3 as Pos)
    expect(editor.commands.uppercase()).toBe(true)
    expect(editor.getText()).toBe('HELLO  there')
    // The caret stays where it was, inside the word.
    expect(editor.selection).toMatchObject({ from: 3, to: 3 })
    // A mention earlier in the block does not shift the word by one.
    editor.commands.select(10 as Pos)
    expect(editor.commands.uppercase()).toBe(true)
    expect(editor.getText()).toBe('HELLO  THERE')
    // Between a space and the mention there is no word.
    editor.commands.select(7 as Pos)
    expect(editor.commands.lowercase()).toBe(false)
  })

  it('spans paragraphs, and a new paragraph starts a new sentence', () => {
    const editor = build('<p>one two</p><p>three four</p>')
    editor.commands.select({ from: 1 as Pos, to: 20 as Pos })
    expect(editor.commands.capitalize()).toBe(true)
    expect(editor.getHTML()).toBe('<p>One Two</p><p>Three Four</p>')
    expect(editor.commands.sentenceCase()).toBe(true)
    expect(editor.getHTML()).toBe('<p>One two</p><p>Three four</p>')
  })

  it('reports false when there is nothing to change', () => {
    const editor = build('<p>HELLO 123</p>')
    editor.commands.select({ from: 1 as Pos, to: 10 as Pos })
    expect(editor.commands.uppercase()).toBe(false)
    editor.commands.select({ from: 7 as Pos, to: 10 as Pos })
    expect(editor.commands.toggleCase()).toBe(false)
    editor.commands.select(1 as Pos)
    expect(editor.commands.uppercase()).toBe(false)
  })

  it('keeps the selection on the text when its length changes', () => {
    const editor = build('<p>straße</p>')
    editor.commands.select({ from: 1 as Pos, to: 7 as Pos })
    expect(editor.commands.uppercase()).toBe(true)
    expect(editor.getText()).toBe('STRASSE')
    expect(editor.selection).toMatchObject({ from: 1, to: 8 })
    expect(editor.commands.lowercase()).toBe(true)
    expect(editor.getText()).toBe('strasse')
  })
})

describe('math', () => {
  const kit = [...starterKit, ...mathKit(), selectNode] as const
  const build = (content: DocNode | string = '<p></p>') =>
    createEditor({ extensions: kit, content })

  it('turns $…$ followed by a space into an inline formula', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'so $E=mc^2$ then')
    expect(editor.getHTML()).toBe(
      '<p>so <span data-math="E=mc^2" class="matra-math">E=mc^2</span> then</p>',
    )
  })

  it('turns $$…$$ at the start of a paragraph into a block', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', '$$\\int_0^1 x$$ after')
    expect(types(editor)).toEqual(['mathBlock', 'paragraph'])
    expect(editor.getJSON().content?.[0]?.attrs).toEqual({ latex: '\\int_0^1 x' })
    expect(editor.getText()).toBe('after')
  })

  it('inserts through commands, and refuses what is not a formula', () => {
    const editor = build('<p>ab</p>')
    editor.commands.select(2 as Pos)
    expect(editor.commands.insertInlineMath('')).toBe(false)
    expect(editor.commands.insertInlineMath('   ')).toBe(false)
    expect(editor.commands.insertInlineMath('a\u0007b')).toBe(false)
    expect(editor.commands.insertInlineMath('x'.repeat(2001))).toBe(false)
    expect(editor.commands.insertBlockMath(null as never)).toBe(false)
    expect(editor.getHTML()).toBe('<p>ab</p>')

    expect(editor.commands.insertInlineMath('x^2')).toBe(true)
    expect(editor.getHTML()).toBe(
      '<p>a<span data-math="x^2" class="matra-math">x^2</span>b</p>',
    )
    expect(editor.commands.insertBlockMath('y')).toBe(true)
    expect(types(editor)).toEqual(['paragraph', 'mathBlock', 'paragraph'])
  })

  it('rewrites the formula the caret is on', () => {
    const editor = build('<p>a<span data-math="x">x</span>b</p>')
    editor.commands.select(3 as Pos)
    expect(editor.commands.setMath('y')).toBe(true)
    expect(editor.getHTML()).toContain('data-math="y"')
    // The same source again is not a change.
    expect(editor.commands.setMath('y')).toBe(false)
    editor.commands.select(1 as Pos)
    expect(editor.commands.setMath('z')).toBe(false)
    editor.commands.selectNodeAt(2)
    expect(editor.commands.setMath('z')).toBe(true)
    expect(editor.getHTML()).toContain('data-math="z"')

    const block = build('<div data-math="q">q</div><p>x</p>')
    block.commands.select(2 as Pos)
    expect(block.commands.setMath('r')).toBe(true)
    expect(block.getJSON().content?.[0]?.attrs).toEqual({ latex: 'r' })
  })

  it('hands each formula to the renderer, and only again when it changes', () => {
    const render = vi.fn((latex: string, element: HTMLElement) => {
      element.textContent = `[${latex}]`
    })
    const editor = createEditor({
      extensions: [...starterKit, ...mathKit({ render })] as const,
      content: '<p>a<span data-math="x">x</span></p><p>b</p><div data-math="y">y</div><p>c</p>',
    })
    const element = mount(editor)
    expect(render).toHaveBeenCalledTimes(2)
    expect(render).toHaveBeenNthCalledWith(1, 'x', expect.any(HTMLElement), false)
    expect(render).toHaveBeenNthCalledWith(2, 'y', expect.any(HTMLElement), true)
    expect(element.querySelector('.matra-math')?.textContent).toBe('[x]')
    expect(element.querySelector('.matra-math-block')?.textContent).toBe('[y]')
    expect(element.querySelector('.matra-math')?.getAttribute('contenteditable')).toBe('false')

    // Typing in another paragraph leaves both alone.
    editor.commands.select(6 as Pos)
    editor.commands.insert('c')
    expect(render).toHaveBeenCalledTimes(2)

    // Rewriting the block formula draws it again, in place.
    editor.commands.select(10 as Pos)
    expect(editor.commands.setMath('z')).toBe(true)
    expect(render).toHaveBeenCalledTimes(3)
    expect(render).toHaveBeenLastCalledWith('z', expect.any(HTMLElement), true)
    expect(element.querySelector('.matra-math-block')?.getAttribute('data-math')).toBe('z')
  })

  it('shows the source when the renderer throws, and carries on', () => {
    const render = vi.fn(() => {
      throw new Error('cannot')
    })
    const editor = createEditor({
      extensions: [...starterKit, ...mathKit({ render })] as const,
      content: '<p><span data-math="x">x</span></p>',
    })
    const element = mount(editor)
    expect(render).toHaveBeenCalledTimes(1)
    expect(element.querySelector('.matra-math code')?.textContent).toBe('x')
    editor.commands.select(1 as Pos)
    expect(editor.commands.insert('ok')).toBe(true)
    expect(editor.getText()).toBe('ok')
  })

  it('round-trips through HTML and JSON, and renders with nothing mounted', () => {
    const html =
      '<p>a <span data-math="x^2" class="matra-math">x^2</span> b</p>' +
      '<div data-math="\\frac{1}{2}" class="matra-math matra-math-block">\\frac{1}{2}</div>'
    const editor = build(html)
    expect(editor.getHTML()).toBe(html)
    expect(build(editor.getJSON()).getHTML()).toBe(html)
    expect(mathCSS).toContain('.matra-math-block')
  })

  it('reads an element with no usable source as text', () => {
    const editor = build(
      `<p><span data-math="">x</span><span data-math="${'y'.repeat(2001)}">y</span></p>`,
    )
    expect(editor.getJSON().content?.[0]?.content?.every((node) => node.type === 'text')).toBe(
      true,
    )
    expect(editor.getText()).toBe('xy')
  })
})

describe('footnotes', () => {
  const build = (content: DocNode | string = '<p>one two</p>') =>
    createEditor({ extensions: [...starterKit, ...footnotesKit()] as const, content })

  const refs = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('sup[data-footnote-ref]')).map((sup) =>
      sup.getAttribute('data-footnote-number'),
    )
  const notes = (element: HTMLElement) =>
    Array.from(element.querySelectorAll('li[data-footnote]')).map((li) =>
      li.classList.contains('matra-footnote-orphan')
        ? 'orphan'
        : li.getAttribute('data-footnote-number'),
    )
  const size = (editor: { unsafe: { state: unknown } }) =>
    (editor.unsafe.state as { doc: { content: { size: number } } }).doc.content.size

  /** Two notes: one after "two", then one after "one" — so the second made is numbered first. */
  const twoNotes = () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.select(8 as Pos)
    expect(editor.commands.insertFootnote()).toBe(true)
    editor.commands.insert('note A')
    editor.commands.select(4 as Pos)
    expect(editor.commands.insertFootnote()).toBe(true)
    editor.commands.insert('note B')
    return { editor, element }
  }

  it('numbers the markers in document order, whatever order they were made in', () => {
    const { editor, element } = twoNotes()
    expect(types(editor)).toEqual(['paragraph', 'footnotes'])
    expect(refs(element)).toEqual(['1', '2'])
    expect(notes(element)).toEqual(['2', '1'])
    expect(editor.getText()).toBe('one two\nnote A\nnote B')
  })

  it('renumbers when a marker goes, and marks the note it leaves behind', () => {
    const { editor, element } = twoNotes()
    editor.commands.remove({ from: 4 as Pos, to: 5 as Pos })
    expect(refs(element)).toEqual(['1'])
    expect(notes(element)).toEqual(['1', 'orphan'])
    expect(editor.getText()).toBe('one two\nnote A\nnote B')
  })

  it('removes a note and its marker together, and the list once it is empty', () => {
    const { editor, element } = twoNotes()
    const paragraph = editor.getJSON().content?.[0]?.content ?? []
    const id = String(paragraph[1]?.attrs?.id)
    expect(editor.commands.removeFootnote(id)).toBe(true)
    expect(refs(element)).toEqual(['1'])
    expect(notes(element)).toEqual(['1'])
    expect(editor.commands.removeFootnote(id)).toBe(false)
    const other = String(editor.getJSON().content?.[0]?.content?.[1]?.attrs?.id)
    expect(editor.commands.removeFootnote(other)).toBe(true)
    expect(editor.getHTML()).toBe('<p>one two</p>')
  })

  it('puts the list back at the end when something got after it', () => {
    const editor = build()
    editor.commands.select(8 as Pos)
    editor.commands.insertFootnote()
    editor.commands.insert(
      { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      size(editor) as Pos,
    )
    expect(types(editor)).toEqual(['paragraph', 'footnotes', 'paragraph'])
    editor.commands.select(2 as Pos)
    expect(editor.commands.insertFootnote()).toBe(true)
    expect(types(editor)).toEqual(['paragraph', 'paragraph', 'footnotes'])
    expect(editor.getJSON().content?.[2]?.content).toHaveLength(2)
  })

  it('refuses a note inside a note', () => {
    const editor = build()
    editor.commands.select(8 as Pos)
    editor.commands.insertFootnote()
    expect(editor.commands.insertFootnote()).toBe(false)
  })

  it('moves between a marker and its note', () => {
    const editor = build()
    editor.commands.select(8 as Pos)
    editor.commands.insertFootnote()
    expect(editor.selection.from).toBe(13)
    const id = String(editor.getJSON().content?.[0]?.content?.[1]?.attrs?.id)
    expect(editor.commands.goToFootnoteRef(id)).toBe(true)
    expect(editor.selection.from).toBe(9)
    expect(editor.commands.goToFootnote(id)).toBe(true)
    expect(editor.selection.from).toBe(13)
    expect(editor.commands.goToFootnote('missing')).toBe(false)
  })

  it('round-trips through HTML and JSON', () => {
    const html =
      '<p>one<sup data-footnote-ref="a1" class="matra-footnote-ref"></sup> two</p>' +
      '<ol data-footnotes="" class="matra-footnotes">' +
      '<li data-footnote="a1" class="matra-footnote"><p>note</p></li></ol>'
    const editor = build(html)
    expect(editor.getHTML()).toBe(html)
    expect(build(editor.getJSON()).getHTML()).toBe(html)
    expect(footnotesCSS).toContain('attr(data-footnote-number)')
  })

  it('refuses ids that are not ids', () => {
    const editor = build('<p>x<sup data-footnote-ref="not an id"></sup>y</p>')
    expect(editor.getJSON().content?.[0]?.content).toHaveLength(1)
    expect(editor.commands.removeFootnote('not an id')).toBe(false)
    expect(editor.commands.goToFootnote('')).toBe(false)
    expect(editor.commands.goToFootnoteRef('a'.repeat(65))).toBe(false)
  })

  it('computes the numbering once per document', () => {
    const kit = footnotesKit()
    const behaviour = kit[3]
    const seen: unknown[] = []
    const original = behaviour.decorations
    behaviour.decorations = (ctx) => {
      const out = original?.call(behaviour, ctx) ?? []
      seen.push(out)
      return out
    }
    const editor = createEditor({
      extensions: [...starterKit, ...kit] as const,
      content: '<p>one<sup data-footnote-ref="a1"></sup></p>',
    })
    mount(editor)
    editor.commands.select(2 as Pos)
    editor.commands.select(3 as Pos)
    expect(seen.length).toBeGreaterThanOrEqual(3)
    expect(seen[1]).toBe(seen[0])
    expect(seen[2]).toBe(seen[0])
    editor.commands.insert('x')
    expect(seen[seen.length - 1]).not.toBe(seen[0])
  })
})
