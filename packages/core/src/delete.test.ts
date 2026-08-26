/**
 * Backspace and Delete, driven the way a browser drives them.
 *
 * The commands are covered elsewhere; what is covered here is the path from a
 * real `beforeinput` event to a change in the document, because that is the
 * path a person actually uses and the one that was reported broken.
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
  element.focus()
  return { editor, element }
}

/** Put the DOM selection where a caret would be, then fire the event. */
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
  return event
}

describe('backspace', () => {
  it('removes the character before the caret', () => {
    const { editor, element } = mount('<p>hello</p>')
    const text = element.querySelector('p')?.firstChild as Text
    caretAt(text, 5)

    fireInput(element, 'deleteContentBackward')
    expect(editor.getText()).toBe('hell')
  })

  // A non-collapsed DOM selection is not reliably readable in happy-dom, so the
  // range branch is driven through the command rather than through the event.
  // The event path above proves the wiring; this proves the arithmetic.
  it('removes a selected range', () => {
    // Unmounted: a mounted view syncs its selection from the DOM, and happy-dom
    // reports a range it was given as collapsed, so the model selection is gone
    // by the time the command runs. That is the fake DOM, not the editor.
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    editor.commands.select({ from: 1 as Pos, to: 4 as Pos })
    editor.commands.remove()
    expect(editor.getText()).toBe('lo')
  })

  it('works a second and third time', () => {
    const { editor, element } = mount('<p>abcd</p>')
    const text = element.querySelector('p')?.firstChild as Text
    caretAt(text, 4)

    fireInput(element, 'deleteContentBackward')
    expect(editor.getText()).toBe('abc')

    const next = element.querySelector('p')?.firstChild as Text
    caretAt(next, 3)
    fireInput(element, 'deleteContentBackward')
    expect(editor.getText()).toBe('ab')
  })

  it('cancels the event so the browser does not also delete', () => {
    const { element } = mount('<p>hello</p>')
    const text = element.querySelector('p')?.firstChild as Text
    caretAt(text, 5)
    const event = fireInput(element, 'deleteContentBackward')
    expect(event.defaultPrevented).toBe(true)
  })

  it('empties a list item rather than doing nothing', () => {
    const { editor, element } = mount('<ul><li><p>x</p></li></ul>')
    const text = element.querySelector('li p')?.firstChild as Text
    caretAt(text, 1)
    fireInput(element, 'deleteContentBackward')
    expect(editor.getText()).toBe('')
  })
})

describe('forward delete', () => {
  it('removes the character after the caret', () => {
    const { editor, element } = mount('<p>hello</p>')
    const text = element.querySelector('p')?.firstChild as Text
    caretAt(text, 0)
    fireInput(element, 'deleteContentForward')
    expect(editor.getText()).toBe('ello')
  })
})

describe('typing', () => {
  it('inserts a character at the caret', () => {
    const { editor, element } = mount('<p>hi</p>')
    const text = element.querySelector('p')?.firstChild as Text
    caretAt(text, 2)
    fireInput(element, 'insertText', '!')
    expect(editor.getText()).toBe('hi!')
  })
})

describe('backspace at the start of a block', () => {
  const caret = (element: HTMLElement, selector: string) => {
    const text = element.querySelector(selector)?.firstChild
    if (text) caretAt(text, 0)
  }

  it('merges a paragraph into the one before it', () => {
    const { editor, element } = mount('<p>one</p><p>two</p>')
    caret(element, 'p:nth-child(2)')
    fireInput(element, 'deleteContentBackward')
    expect(editor.getJSON().content?.length).toBe(1)
    expect(editor.getText()).toBe('onetwo')
  })

  it('removes an empty paragraph', () => {
    const { editor, element } = mount('<p>one</p><p></p>')
    const empty = element.querySelectorAll('p')[1] as HTMLElement
    caretAt(empty, 0)
    fireInput(element, 'deleteContentBackward')
    expect(editor.getJSON().content?.length).toBe(1)
    expect(editor.getText()).toBe('one')
  })

  // Outdenting a *non-empty* item at its start is not implemented: liftTarget
  // refuses a top-level list, and doing it properly is a bigger change than
  // this fix. Backspace there does nothing rather than doing damage, which is
  // the acceptable half of the two.
  it('leaves a non-empty list item alone rather than mangling it', () => {
    const { editor, element } = mount('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
    const second = element.querySelectorAll('li p')[1] as HTMLElement
    caretAt(second.firstChild ?? second, 0)
    expect(() => fireInput(element, 'deleteContentBackward')).not.toThrow()
    expect(editor.getText()).toBe('one\ntwo')
  })

  it('removes an empty list item instead of leaving it stuck', () => {
    const { editor, element } = mount('<ul><li><p>one</p></li><li><p></p></li></ul>')
    const before = JSON.stringify(editor.getJSON())
    const empty = element.querySelectorAll('li p')[1] as HTMLElement
    caretAt(empty, 0)
    fireInput(element, 'deleteContentBackward')
    expect(JSON.stringify(editor.getJSON())).not.toBe(before)
  })

  it('does nothing at the very start of the document', () => {
    const { editor, element } = mount('<p>only</p>')
    caret(element, 'p')
    fireInput(element, 'deleteContentBackward')
    expect(editor.getText()).toBe('only')
  })

  it('never throws, wherever the caret is', () => {
    const { editor, element } = mount('<h2>title</h2><ul><li><p>a</p></li></ul><p>end</p>')
    for (const selector of ['h2', 'li p', 'p:last-child']) {
      const node = element.querySelector(selector)
      if (node?.firstChild) caretAt(node.firstChild, 0)
      expect(() => fireInput(element, 'deleteContentBackward')).not.toThrow()
    }
    expect(editor.getHTML()).toBeTypeOf('string')
  })
})
