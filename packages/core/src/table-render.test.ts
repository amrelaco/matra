/**
 * A table survives being edited.
 *
 * `table` is the one node in the kit whose `toDOM` puts the content hole below
 * its own element — `['table', ['tbody', 0]]`. The patcher used to line model
 * children up against the outer element's children, so rows were compared with
 * the single `<tbody>`, cells were patched as if they were rows, and one press
 * of Enter in a cell left a table with its rows drawn twice. Every assertion
 * here compares the live DOM with the model, because the model was right the
 * whole time and the screen was not.
 */
import { describe, expect, it } from 'vitest'
import { tableCell, tableHeader, table as tableNode, tableRow } from './extensions/table'
import {
  bold,
  createEditor,
  document as doc,
  hardBreak,
  history,
  italic,
  paragraph,
  text,
} from './index'
import type { Pos } from './types'

const KIT = [
  doc,
  paragraph,
  text,
  tableNode,
  tableRow,
  tableCell,
  tableHeader,
  bold,
  italic,
  hardBreak,
  history,
]

const GRID =
  '<table><tbody>' +
  '<tr><td><p>a1</p></td><td><p>b1</p></td></tr>' +
  '<tr><td><p>a2</p></td><td><p>b2</p></td></tr>' +
  '</tbody></table>'

const mount = (content = GRID) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({ extensions: KIT as never, content })
  editor.mount(host)
  host.focus()
  return { editor, host }
}

/**
 * What is on screen, minus the scaffolding.
 *
 * An empty textblock gets a marked `<br>` so the caret has somewhere to stand.
 * It is deliberately not part of the document, so it is not part of what the
 * screen is compared against either.
 */
const screen = (host: HTMLElement) => host.innerHTML.replace(/<br data-matra-filler="">/g, '')

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

describe('rendering a table through an edit', () => {
  it('Enter inside a cell splits that cell and nothing else', () => {
    const { editor, host } = mount()
    caretAt(host.querySelector('td p')?.firstChild as Text, 1)
    fireInput(host, 'insertParagraph')

    expect(editor.getHTML()).toBe(
      '<table><tbody>' +
        '<tr><td><p>a</p><p>1</p></td><td><p>b1</p></td></tr>' +
        '<tr><td><p>a2</p></td><td><p>b2</p></td></tr>' +
        '</tbody></table>',
    )
    // The screen has to agree with the model, which is the half that broke.
    expect(screen(host)).toBe(editor.getHTML())
  })

  it('does not draw the rows twice', () => {
    const { host } = mount()
    caretAt(host.querySelector('td p')?.firstChild as Text, 1)
    fireInput(host, 'insertParagraph')

    expect(host.querySelectorAll('tbody').length).toBe(1)
    expect(host.querySelectorAll('tr').length).toBe(2)
    // Every row belongs to the body; none escaped to sit beside it.
    for (const row of Array.from(host.querySelectorAll('tr'))) {
      expect(row.parentElement?.tagName).toBe('TBODY')
    }
  })

  it('typing in a cell touches only that cell', () => {
    const { editor, host } = mount()
    caretAt(host.querySelector('td p')?.firstChild as Text, 2)
    fireInput(host, 'insertText', '!')

    expect(editor.getHTML()).toContain('<td><p>a1!</p></td>')
    expect(screen(host)).toBe(editor.getHTML())
  })

  it('backspace across a cell boundary leaves the table standing', () => {
    const { editor, host } = mount()
    caretAt(host.querySelector('td p')?.firstChild as Text, 1)
    fireInput(host, 'deleteContentBackward')

    expect(editor.getHTML()).toContain('<td><p>1</p></td>')
    expect(screen(host)).toBe(editor.getHTML())
  })

  it('an edit in the second row does not disturb the first', () => {
    const { editor, host } = mount()
    const rows = host.querySelectorAll('tr')
    const cell = rows[1]?.querySelector('p')?.firstChild as Text
    caretAt(cell, 2)
    fireInput(host, 'insertText', 'z')

    expect(editor.getHTML()).toContain('<tr><td><p>a2z</p></td>')
    expect(screen(host)).toBe(editor.getHTML())
  })

  it('a table inserted into a document renders where the model says', () => {
    const editor = createEditor({ extensions: KIT as never, content: '<p>before</p>' })
    const host = document.createElement('div')
    editor.mount(host)
    const commands = editor.commands as unknown as Record<string, (...a: unknown[]) => boolean>
    commands.insertTable?.(2, 2)
    expect(screen(host)).toBe(editor.getHTML())
    expect(host.querySelectorAll('tr').length).toBe(2)
  })

  it('removing a row redraws the rest in place', () => {
    const { editor, host } = mount()
    // The whole second row, brackets included. Asserting the command took is
    // the point: a refused delete would leave the table intact and this test
    // would pass without having exercised anything.
    expect(editor.commands.remove({ from: 15 as Pos, to: 29 as Pos })).toBe(true)
    expect(host.querySelectorAll('tr').length).toBe(1)
    expect(screen(host)).toBe(editor.getHTML())
    expect(host.querySelectorAll('tbody').length).toBe(1)
  })
})
