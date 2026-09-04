/**
 * The caret and the selection through changes of structure.
 *
 * Select a word, press the heading button, press bold: the word should be
 * bold. Press Tab in a list item: the caret should still be in the word it
 * was in. Both used to fail, because a structural change was a plain
 * replacement whose map sent every position inside it to the end.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { callout, starterKit, taskItem, taskList } from './extensions'
import type { Pos } from './types'

const build = (content: string) =>
  createEditor({ extensions: [...starterKit, taskList, taskItem, callout] as const, content })

const selectedText = (editor: ReturnType<typeof build>) => {
  const { from, to } = editor.selection
  const doc = editor.unsafe.state as { doc: { textBetween(a: number, b: number): string } }
  return doc.doc.textBetween(from, to)
}

describe('a selection survives', () => {
  const cases: Array<[string, (c: ReturnType<typeof build>['commands']) => boolean]> = [
    ['a heading', (c) => c.setHeading(2)],
    ['a paragraph again', (c) => c.setHeading(2) && c.setParagraph()],
    ['a blockquote', (c) => c.toggleBlockquote()],
    ['a bullet list', (c) => c.toggleBulletList()],
    ['an ordered list', (c) => c.toggleOrderedList()],
    ['a task list', (c) => c.toggleTaskList()],
    // A code block takes no marks, so it is left again before bolding.
    ['a code block', (c) => c.toggleCodeBlock() && c.toggleCodeBlock()],
    ['a callout', (c) => c.toggleCallout('info')],
    ['leaving a list', (c) => c.toggleBulletList() && c.toggleBulletList()],
    ['leaving a quote', (c) => c.toggleBlockquote() && c.toggleBlockquote()],
  ]
  for (const [label, run] of cases) {
    it(`becoming ${label}`, () => {
      const editor = build('<p>hello world</p>')
      editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
      expect(run(editor.commands)).toBe(true)
      expect(selectedText(editor)).toBe('hello')
      expect(editor.commands.toggleBold()).toBe(true)
      expect(editor.getHTML()).toContain('<strong>hello</strong>')
    })
  }

  it('inside a code block, as far as a code block allows', () => {
    const editor = build('<p>hello world</p>')
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    expect(editor.commands.toggleCodeBlock()).toBe(true)
    expect(selectedText(editor)).toBe('hello')
  })
})

describe('the caret in a list', () => {
  it('stays in its word when the item is nested and lifted', () => {
    const editor = build('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
    editor.commands.select(11 as Pos)
    expect(editor.commands.sinkListItem()).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>')
    expect(editor.selection.from).toBe(11)
    expect(editor.commands.liftListItem()).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
    expect(editor.selection.from).toBe(11)
    expect(editor.commands.insert('|')).toBe(true)
    expect(editor.getText()).toContain('t|wo')
  })

  it('leaves a top-level list on Shift-Tab, keeping the caret', () => {
    const editor = build('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
    editor.commands.select(11 as Pos)
    expect(editor.commands.liftListItem()).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li></ul><p>two</p>')
    expect(editor.commands.insert('|')).toBe(true)
    expect(editor.getText()).toContain('t|wo')
  })

  it('does the same for a task item', () => {
    const editor = build(
      '<ul data-type="taskList"><li data-checked="false"><p>one</p></li><li data-checked="false"><p>two</p></li></ul>',
    )
    editor.commands.select(11 as Pos)
    expect(editor.commands.sinkTaskItem()).toBe(true)
    expect(editor.selection.from).toBe(11)
    expect(editor.commands.liftTaskItem()).toBe(true)
    expect(editor.selection.from).toBe(11)
    expect(editor.commands.liftTaskItem()).toBe(true)
    expect(editor.getHTML()).toMatch(/<\/ul><p>two<\/p>$/)
  })

  it('brings the items after it along when a nested item is lifted', () => {
    const editor = build(
      '<ul><li><p>one</p><ul><li><p>two</p></li><li><p>three</p></li></ul></li></ul>',
    )
    editor.commands.select(11 as Pos)
    expect(editor.commands.liftListItem()).toBe(true)
    expect(editor.getHTML()).toBe(
      '<ul><li><p>one</p></li><li><p>two</p><ul><li><p>three</p></li></ul></li></ul>',
    )
    expect(editor.commands.insert('|')).toBe(true)
    expect(editor.getText()).toContain('t|wo')
  })

  it('keeps the caret through Enter on an empty item at the end of a list', () => {
    const editor = build('<ul><li><p>one</p></li><li><p></p></li></ul>')
    editor.commands.select(10 as Pos)
    expect(editor.commands.splitListItem()).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li></ul><p></p>')
    expect(editor.commands.insert('x')).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li></ul><p>x</p>')
  })
})
