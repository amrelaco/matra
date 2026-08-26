import { describe, expect, it } from 'vitest'
import { starterKit } from './extensions/starter-kit'
import { createEditor } from './index'
import type { Pos } from './types'

/**
 * Enter on an empty item has to end the list.
 *
 * `liftListItem` cannot help at the top level — there is no ancestor to lift
 * into — so this is the case where a list would otherwise be a room with no
 * door: every Enter makes another empty bullet and nothing gets you out.
 */
describe('leaving a list with Enter', () => {
  const mount = (content: string) => {
    const editor = createEditor({ extensions: starterKit, content })
    editor.mount(document.createElement('div'))
    return editor
  }

  it('turns a trailing empty item into a paragraph', () => {
    const editor = mount('<ul><li><p>one</p></li><li><p></p></li></ul>')
    editor.commands.select(10 as Pos)
    expect(editor.commands.splitListItem()).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li></ul><p></p>')
  })

  it('splits the list when the empty item is in the middle', () => {
    const editor = mount('<ul><li><p>a</p></li><li><p></p></li><li><p>b</p></li></ul>')
    editor.commands.select(8 as Pos)
    expect(editor.commands.splitListItem()).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>a</p></li></ul><p></p><ul><li><p>b</p></li></ul>')
  })

  it('leaves the caret in the new paragraph', () => {
    const editor = mount('<ul><li><p>a</p></li><li><p></p></li></ul>')
    editor.commands.select(8 as Pos)
    editor.commands.splitListItem()
    editor.commands.insert('typed')
    expect(editor.getHTML()).toBe('<ul><li><p>a</p></li></ul><p>typed</p>')
  })

  it('replaces the list entirely when the empty item is the only one', () => {
    const editor = mount('<ul><li><p></p></li></ul>')
    editor.commands.select(3 as Pos)
    expect(editor.commands.splitListItem()).toBe(true)
    expect(editor.getHTML()).toBe('<p></p>')
  })
})

/**
 * Tab has to be a door that opens both ways.
 *
 * `lift` moves a range up one parent, which for an item inside a nested list
 * means lifting it into the item that holds that list rather than out beside
 * it — so `liftTarget` refused and Shift-Tab did nothing at all, for bullets
 * and checklists alike.
 */
describe('outdenting a nested item', () => {
  const mount = (content: string) => {
    const editor = createEditor({ extensions: starterKit, content })
    editor.mount(document.createElement('div'))
    return editor
  }

  it('moves it out one level', () => {
    const editor = mount('<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>')
    editor.commands.select(11 as Pos)
    const commands = editor.commands as unknown as Record<string, () => boolean>
    expect(commands.liftListItem?.()).toBe(true)
    expect(editor.getHTML()).toBe('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
  })

  it('takes the items below it along as its own', () => {
    const editor = mount(
      '<ul><li><p>a</p><ul><li><p>b</p></li><li><p>c</p></li></ul></li></ul>',
    )
    // Caret in "b", the first of the two nested items.
    editor.commands.select(7 as Pos)
    const commands = editor.commands as unknown as Record<string, () => boolean>
    expect(commands.liftListItem?.()).toBe(true)
    expect(editor.getHTML()).toBe(
      '<ul><li><p>a</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li></ul>',
    )
  })

  it('leaves the caret in the same word', () => {
    const editor = mount('<ul><li><p>one</p><ul><li><p>two</p></li></ul></li></ul>')
    editor.commands.select(11 as Pos)
    const commands = editor.commands as unknown as Record<string, () => boolean>
    commands.liftListItem?.()
    editor.commands.insert('X')
    expect(editor.getText()).toBe('one\ntXwo')
  })
})
