/**
 * Undo groups by time, and some changes must refuse to be grouped.
 *
 * Typing wants grouping: one press of Mod-Z should take back a word, not a
 * letter. A deliberate structural change — restoring a saved version, accepting
 * a rewrite, applying a template — does not, because merging it into whatever
 * sentence was being typed a second earlier means undoing the change also
 * undoes the sentence, and there is no press that gets you back to just one of
 * them.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Command, Ctx, ExtensionDef, Pos } from './types'

/** Two commands that do the same edit; one of them refuses to be grouped. */
const probe = {
  kind: 'extension',
  name: 'probe',
  commands: {
    shout: (ctx: Ctx) => ctx.insert('!', 1 as Pos),
    shoutAlone: (ctx: Ctx) => ctx.insert('!', 1 as Pos) && ctx.isolateUndo(),
  },
} satisfies ExtensionDef<{ shout: Command; shoutAlone: Command }>

const editorWith = () =>
  createEditor({
    extensions: [...starterKit, probe],
    content: '<p>text</p>',
  })

describe('isolateUndo', () => {
  it('would otherwise be merged into the keystroke before it', () => {
    const editor = editorWith()
    editor.commands.select(1 as Pos)
    editor.commands.insert('a')
    editor.commands.shout()
    expect(editor.getText()).toBe('!atext')

    // Both edits landed inside the grouping window, so one undo takes both.
    editor.commands.undo()
    expect(editor.getText()).toBe('text')
  })

  it('is its own step when it says so', () => {
    const editor = editorWith()
    editor.commands.select(1 as Pos)
    editor.commands.insert('a')
    editor.commands.shoutAlone()
    expect(editor.getText()).toBe('!atext')

    editor.commands.undo()
    expect(editor.getText()).toBe('atext')

    editor.commands.undo()
    expect(editor.getText()).toBe('text')
  })

  it('redoes in the same two steps', () => {
    const editor = editorWith()
    editor.commands.select(1 as Pos)
    editor.commands.insert('a')
    editor.commands.shoutAlone()

    editor.commands.undo()
    editor.commands.undo()
    expect(editor.getText()).toBe('text')

    editor.commands.redo()
    expect(editor.getText()).toBe('atext')
    editor.commands.redo()
    expect(editor.getText()).toBe('!atext')
  })

  it('does not isolate the change that comes after it', () => {
    const editor = editorWith()
    editor.commands.shoutAlone()
    editor.commands.select(1 as Pos)
    editor.commands.insert('a')
    editor.commands.insert('b')
    expect(editor.getText()).toBe('a!btext')

    // The two plain inserts are still one entry between them.
    editor.commands.undo()
    expect(editor.getText()).toBe('!text')
  })
})
