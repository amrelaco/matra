/**
 * A checklist behaves like a list.
 *
 * `listItem` had Enter, Tab and Shift-Tab; `taskItem` had none of them, because
 * the list commands looked for a node literally named `listItem`. So Enter in a
 * checklist made a second paragraph inside the same item — one checkbox, two
 * lines — and `[] ` did not convert at all, because that input rule finished
 * with `setBlockType('taskItem')` on a node that holds blocks and can never be
 * a textblock.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import { taskItem, taskList } from './extensions/task-list'
import type { Pos } from './types'

const mount = (content: string) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ extensions: [...starterKit, taskList, taskItem], content })
  editor.mount(host)
  host.focus()
  return { editor, host }
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

/** Enter is a keydown before it is an input · that is where keymaps run. */
const pressEnter = (element: HTMLElement) => {
  const down = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  element.dispatchEvent(down)
  if (!down.defaultPrevented) fireInput(element, 'insertParagraph')
}

const ONE = '<ul data-type="taskList"><li data-checked="false"><p>one</p></li></ul>'

describe('typing a checklist into being', () => {
  it('[] becomes a checkbox', () => {
    const { editor, host } = mount('<p></p>')
    editor.commands.select(1 as Pos)
    editor.commands.insert('[]')
    caretAt(host.querySelector('p')?.firstChild as Text, 2)
    fireInput(host, 'insertText', ' ')

    expect(editor.getHTML()).toContain('data-type="taskList"')
    expect(editor.getHTML()).toContain('data-checked="false"')
  })

  it('[x] becomes a ticked checkbox', () => {
    const { editor, host } = mount('<p></p>')
    editor.commands.select(1 as Pos)
    editor.commands.insert('[x]')
    caretAt(host.querySelector('p')?.firstChild as Text, 3)
    fireInput(host, 'insertText', ' ')

    expect(editor.getHTML()).toContain('data-checked="true"')
  })

  it('leaves the brackets alone in the middle of a line', () => {
    const { editor, host } = mount('<p>see</p>')
    editor.commands.select(4 as Pos)
    editor.commands.insert(' []')
    caretAt(host.querySelector('p')?.firstChild as Text, 6)
    fireInput(host, 'insertText', ' ')

    expect(editor.getHTML()).not.toContain('taskList')
  })
})

describe('Enter in a checklist', () => {
  it('makes another checkbox, not another paragraph', () => {
    const { editor, host } = mount(ONE)
    editor.commands.select(6 as Pos)
    pressEnter(host)

    expect(editor.getHTML()).toBe(
      '<ul data-type="taskList" class="matra-task-list">' +
        '<li data-checked="false" class="matra-task-item">' +
        '<label contenteditable="false" class="matra-task-check">' +
        '<input type="checkbox"></label>' +
        '<div class="matra-task-body"><p>one</p></div></li>' +
        '<li data-checked="false" class="matra-task-item">' +
        '<label contenteditable="false" class="matra-task-check">' +
        '<input type="checkbox"></label>' +
        '<div class="matra-task-body"><p></p></div></li></ul>',
    )
  })

  it('the new box starts unticked, whatever the one above it says', () => {
    const { editor, host } = mount(
      '<ul data-type="taskList"><li data-checked="true"><p>done</p></li></ul>',
    )
    editor.commands.select(7 as Pos)
    pressEnter(host)

    const html = editor.getHTML()
    expect(html.indexOf('data-checked="true"')).toBeLessThan(
      html.indexOf('data-checked="false"'),
    )
  })

  it('splits the text at the caret', () => {
    const { editor, host } = mount(ONE)
    editor.commands.select(4 as Pos)
    pressEnter(host)

    expect(editor.getText()).toBe('o\nne')
  })

  it('an empty item leaves the list', () => {
    const { editor, host } = mount(
      '<ul data-type="taskList"><li data-checked="false"><p>one</p></li>' +
        '<li data-checked="false"><p></p></li></ul>',
    )
    editor.commands.select(9 as Pos)
    pressEnter(host)

    expect(editor.getHTML()).toContain('</ul><p></p>')
  })
})

describe('Tab in a checklist', () => {
  const press = (element: HTMLElement, shift: boolean) => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: shift,
        bubbles: true,
        cancelable: true,
      }),
    )
  }

  it('nests an item under the one above it', () => {
    const { editor, host } = mount(
      '<ul data-type="taskList"><li data-checked="false"><p>one</p></li>' +
        '<li data-checked="false"><p>two</p></li></ul>',
    )
    editor.commands.select(12 as Pos)
    press(host, false)

    // The second item now lives inside the first.
    expect(editor.getHTML()).toContain('<div class="matra-task-body"><p>one</p><ul')
  })

  it('Shift-Tab brings it back out', () => {
    const { editor, host } = mount(
      '<ul data-type="taskList"><li data-checked="false"><p>one</p></li>' +
        '<li data-checked="false"><p>two</p></li></ul>',
    )
    editor.commands.select(12 as Pos)
    press(host, false)
    press(host, true)

    expect(editor.getHTML()).not.toContain('<p>one</p><ul')
  })
})
