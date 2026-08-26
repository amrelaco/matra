import { describe, expect, it } from 'vitest'
import { starterKit } from './extensions/starter-kit'
import { activeSuggestion, suggestion } from './extensions/suggestion'
import { createEditor } from './index'
import type { Pos } from './types'

/**
 * The sequence a slash menu actually performs.
 *
 * The extension is headless, so what it promises is only worth as much as the
 * host's side of the bargain: type the trigger, read the query, take the range
 * back out, convert the block that is left. The last step is the one worth
 * pinning down — removing the range has to leave the caret in that block, or
 * the command lands somewhere else and the menu looks broken while every unit
 * underneath it passes.
 */
describe('driving a slash menu', () => {
  const open = (content = '<p></p>') => {
    const editor = createEditor({
      extensions: [...starterKit, suggestion({ char: '/', name: 'slash' })],
      content,
    })
    editor.mount(document.createElement('div'))
    return editor
  }

  it('reports the query as it is typed', () => {
    const editor = open()
    editor.commands.select(1 as Pos)
    editor.commands.insert('/head')
    expect(activeSuggestion(editor, 'slash')?.query).toBe('head')
  })

  it('removing the range leaves the caret in the block it converts', () => {
    const editor = open()
    editor.commands.select(1 as Pos)
    editor.commands.insert('/head')

    const active = activeSuggestion(editor, 'slash')
    expect(active).not.toBeNull()
    editor.commands.remove(active?.range as never)
    ;(editor.commands as unknown as Record<string, (n: number) => boolean>).toggleHeading?.(1)

    expect(editor.getHTML()).toBe('<h1></h1>')
    editor.commands.insert('Title')
    expect(editor.getHTML()).toBe('<h1>Title</h1>')
  })

  it('takes back only the trigger and the query', () => {
    const editor = open('<p>keep me</p>')
    editor.commands.select(8 as Pos)
    editor.commands.insert(' /list')
    expect(editor.getHTML()).toBe('<p>keep me /list</p>')

    const active = activeSuggestion(editor, 'slash')
    editor.commands.remove(active?.range as never)
    expect(editor.getHTML()).toBe('<p>keep me </p>')
  })

  it('a slash inside a word is not a trigger', () => {
    const editor = open('<p>and</p>')
    editor.commands.select(4 as Pos)
    editor.commands.insert('/or')
    expect(activeSuggestion(editor, 'slash')).toBeNull()
  })

  it('a space ends it, so a sentence does not hold the menu open', () => {
    const editor = open()
    editor.commands.select(1 as Pos)
    editor.commands.insert('/head is not a command')
    expect(activeSuggestion(editor, 'slash')).toBeNull()
  })

  it('Escape closes it and it stays closed', () => {
    const editor = open()
    editor.commands.select(1 as Pos)
    editor.commands.insert('/h')
    expect(activeSuggestion(editor, 'slash')).not.toBeNull()

    const commands = editor.commands as unknown as Record<string, () => boolean>
    commands.cancelSuggestion?.()
    expect(activeSuggestion(editor, 'slash')).toBeNull()

    // An arrow key produces a transaction, and the menu must not come back.
    editor.commands.select(2 as Pos)
    expect(activeSuggestion(editor, 'slash')).toBeNull()
  })
})
