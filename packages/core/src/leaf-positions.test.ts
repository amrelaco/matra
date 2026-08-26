/**
 * A leaf costs one position, and the DOM map has to agree.
 *
 * `<br>`, `<hr>`, `<img>`, a mention — none of them is a recorded container, so
 * counting their borders gave zero. Every caret position after one of them in
 * the same block then came back one short, and the damage showed up as an
 * editing bug rather than an arithmetic one: press Enter at the end of a heading
 * that contains a line break and the split landed one character early, so the
 * final full stop walked off into the new block on its own.
 *
 * Driven through `beforeinput`, because the whole point is the path from a real
 * caret in real DOM to a position in the model.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import { bold, code, hardBreak, highlight, italic, strike, underline } from './extensions'
import { document as doc, paragraph, text } from './extensions'
import { history } from './extensions/history'
import { image } from './extensions/image'
import { mention } from './extensions/mention'
import { typography } from './extensions/typography'

const mount = (content: string, extensions: readonly unknown[] = starterKit) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = createEditor({ extensions: extensions as never, content })
  editor.mount(element)
  element.focus()
  return { editor, element }
}

const caretAt = (node: globalThis.Node, offset: number) => {
  const selection = document.getSelection()
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
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

/** Put the caret at the very end of the last text node inside `selector`. */
const caretAtEndOf = (element: HTMLElement, selector: string) => {
  const block = element.querySelector(selector) as HTMLElement
  const last = block.childNodes[block.childNodes.length - 1] as Text
  caretAt(last, (last.nodeValue ?? '').length)
}

describe('positions after a line break', () => {
  it('Enter at the end of a heading leaves the heading whole', () => {
    const { editor, element } = mount('<h2>Not a demo.<br>The actual editor.</h2>')
    caretAtEndOf(element, 'h2')
    fireInput(element, 'insertParagraph')

    expect(editor.getHTML()).toBe('<h2>Not a demo.<br>The actual editor.</h2><h2></h2>')
  })

  it('typing after a break appends where the caret is', () => {
    const { editor, element } = mount('<p>one<br>two</p>')
    caretAtEndOf(element, 'p')
    fireInput(element, 'insertText', '!')

    expect(editor.getHTML()).toBe('<p>one<br>two!</p>')
  })

  it('backspace after a break takes the last character, not the one before it', () => {
    const { editor, element } = mount('<p>one<br>two</p>')
    caretAtEndOf(element, 'p')
    fireInput(element, 'deleteContentBackward')

    expect(editor.getHTML()).toBe('<p>one<br>tw</p>')
  })

  it('two breaks are two positions, not none', () => {
    const { editor, element } = mount('<p>a<br><br>b</p>')
    caretAtEndOf(element, 'p')
    fireInput(element, 'insertText', 'z')

    expect(editor.getHTML()).toBe('<p>a<br><br>bz</p>')
  })

  // Without the fix this was the heading bug in miniature: the block before the
  // caret is a leaf, so everything after it in the document shifted by one.
  it('an image inline does not shift the text after it', () => {
    const { editor, element } = mount('<p>before<img src="/a.png">after</p>', [
      ...starterKit,
      image,
    ])
    caretAtEndOf(element, 'p')
    fireInput(element, 'insertText', '!')

    expect(editor.getText()).toBe('beforeafter!')
  })

  it('a mention costs one position, not the length of its label', () => {
    const { editor, element } = mount(
      '<p>hi <span data-mention-id="1" data-mention-label="Nahim">@Nahim</span> there</p>',
      [...starterKit, mention()],
    )
    caretAtEndOf(element, 'p')
    fireInput(element, 'insertText', '!')

    expect(editor.getText().endsWith('there!')).toBe(true)
  })
})

/**
 * The shape the landing page actually uses.
 *
 * There the editor is mounted *on* the `h2`, and the heading's markup becomes a
 * single paragraph carrying a hard break — not a heading node at all. That is a
 * different path through the position map from the one above, and it is the one
 * the bug was reported against, so it is worth its own test rather than an
 * assumption that the two are the same.
 */
describe('an editor mounted on the heading itself', () => {
  const LINE = [
    doc,
    paragraph,
    text,
    bold,
    italic,
    strike,
    code,
    underline,
    highlight,
    hardBreak,
    history,
    typography,
  ]

  it('Enter at the end keeps the last character where it was', () => {
    const host = document.createElement('h2')
    document.body.appendChild(host)
    const editor = createEditor({
      extensions: LINE as never,
      content: 'Not a demo.<br />The actual editor.',
    })
    editor.mount(host)
    host.focus()

    const block = host.querySelector('p') as HTMLElement
    const last = block.childNodes[block.childNodes.length - 1] as Text
    caretAt(last, (last.nodeValue ?? '').length)
    fireInput(host, 'insertParagraph')

    expect(editor.getHTML()).toBe('<p>Not a demo.<br>The actual editor.</p><p></p>')
  })
})

describe('getting out of a list', () => {
  it('backspace on the only bullet turns it into a paragraph', () => {
    const { editor, element } = mount('<p>above</p><ul><li><p></p></li></ul>')
    caretAt(element.querySelector('li p') as HTMLElement, 0)
    fireInput(element, 'deleteContentBackward')

    expect(editor.getHTML()).toBe('<p>above</p><p></p>')
  })

  it('backspace at the start of a bullet with text keeps the text', () => {
    const { editor, element } = mount('<ul><li><p>words</p></li></ul>')
    const text = element.querySelector('li p')?.firstChild as Text
    caretAt(text, 0)
    fireInput(element, 'deleteContentBackward')

    expect(editor.getHTML()).toBe('<p>words</p>')
  })

  it('backspace on the last bullet leaves the ones above it alone', () => {
    const { editor, element } = mount('<ul><li><p>one</p></li><li><p></p></li></ul>')
    const items = element.querySelectorAll('li p')
    caretAt(items[1] as HTMLElement, 0)
    fireInput(element, 'deleteContentBackward')

    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li></ul><p></p>')
  })
})
