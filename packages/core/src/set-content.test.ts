/**
 * Loading a document starts its history here.
 *
 * `setContent` replaced the document with an ordinary transaction, so it was
 * recorded like any edit — which left one press of undo standing between the
 * user and the *previous* document, in an editor that would then save that
 * content under the new document's id. Silent data loss wearing a working
 * undo button.
 *
 * Changing what somebody is editing is a different operation and stays
 * undoable: that is `replace(range, content)`, which is an edit.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos, Range } from './types'

const editor = (content: string) => createEditor({ extensions: starterKit, content })

describe('setContent', () => {
  it('cannot be undone back into the previous document', () => {
    const it = editor('<p>document A</p>')
    it.commands.select(1 as Pos)
    it.commands.insert('edited ')
    expect(it.getText()).toBe('edited document A')

    it.setContent('<p>document B</p>')
    expect(it.getText()).toBe('document B')

    it.commands.undo()
    expect(it.getText()).toBe('document B')
  })

  it('leaves the new document editable and undoable from there', () => {
    const it = editor('<p>document A</p>')
    it.setContent('<p>document B</p>')

    it.commands.select(1 as Pos)
    it.commands.insert('the ')
    expect(it.getText()).toBe('the document B')

    // Its own history works · it is only the jump between documents that does
    // not, which is the point.
    it.commands.undo()
    expect(it.getText()).toBe('document B')
  })

  it('drops the redo branch too', () => {
    const it = editor('<p>one</p>')
    it.commands.select(1 as Pos)
    it.commands.insert('X')
    it.commands.undo()
    expect(it.getText()).toBe('one')

    it.setContent('<p>two</p>')
    it.commands.redo()
    expect(it.getText()).toBe('two')
  })

  it('takes JSON as well as a string', () => {
    const it = editor('<p>from html</p>')
    it.setContent({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'from json' }] }],
    } as never)
    expect(it.getText()).toBe('from json')
  })
})

describe('replace, which is an edit and stays undoable', () => {
  it('changes the document in front of the user and can be taken back', () => {
    const it = editor('<p>hello world</p>')
    const range = { from: 1 as Pos, to: 6 as Pos } as Range

    expect(it.commands.replace(range, 'goodbye')).toBe(true)
    expect(it.getText()).toBe('goodbye world')

    it.commands.undo()
    expect(it.getText()).toBe('hello world')
  })
})
