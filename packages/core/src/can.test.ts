/**
 * Asking a command whether it would work, without letting it.
 *
 * A toolbar has two states to draw and only one of them was reachable:
 * `isActive` says whether bold is on, and nothing said whether bold is even
 * possible here. So a button over a code block looked pressable, was pressed,
 * and did nothing — the command returned false into the void.
 *
 * The risk in a dry run is that a command escapes the transaction that gets
 * discarded. Undo did exactly that, so it is tested hardest.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import { pos, range } from './pos'

const editor = (content: string) => createEditor({ extensions: starterKit, content })

describe('editor.can', () => {
  it('answers the same as the command would', () => {
    const it_ = editor('<p>hello world</p>')
    it_.commands.select(range(1, 6))
    expect(it_.can.toggleBold()).toBe(true)
    expect(it_.commands.toggleBold()).toBe(true)
  })

  it('refuses a mark the node will not hold, before the user finds out', () => {
    const it_ = editor('<pre><code>const x = 1</code></pre>')
    it_.commands.select(range(1, 6))
    // `codeBlock` declares `marks: ''`.
    expect(it_.can.toggleBold()).toBe(false)
    expect(it_.getHTML()).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('leaves the document exactly as it was', () => {
    const it_ = editor('<p>hello world</p>')
    it_.commands.select(range(1, 6))
    const before = JSON.stringify(it_.getJSON())

    it_.can.toggleBold()
    it_.can.setHeading(2)
    it_.can.toggleBulletList()
    it_.can.replace(range(1, 6), 'goodbye')

    expect(JSON.stringify(it_.getJSON())).toBe(before)
  })

  it('does not fire a change event', () => {
    const it_ = editor('<p>hello</p>')
    let changes = 0
    it_.on('change', () => changes++)
    it_.commands.select(range(1, 5))
    it_.can.toggleBold()
    expect(changes).toBe(0)
  })

  it('does not undo when asked whether it could', () => {
    const it_ = editor('<p>one</p>')
    it_.commands.select(pos(1))
    it_.commands.insert('X')
    expect(it_.getText()).toBe('Xone')

    // The whole reason `dry` exists: undo applies itself rather than building
    // a transaction, so discarding the transaction would not have stopped it.
    expect(it_.can.undo()).toBe(true)
    expect(it_.getText()).toBe('Xone')

    expect(it_.commands.undo()).toBe(true)
    expect(it_.getText()).toBe('one')
  })

  it('says no when there is nothing to undo', () => {
    const it_ = editor('<p>one</p>')
    expect(it_.can.undo()).toBe(false)
    expect(it_.can.redo()).toBe(false)
  })

  it('does not redo when asked', () => {
    const it_ = editor('<p>one</p>')
    it_.commands.select(pos(1))
    it_.commands.insert('X')
    it_.commands.undo()

    expect(it_.can.redo()).toBe(true)
    expect(it_.getText()).toBe('one')
    it_.commands.redo()
    expect(it_.getText()).toBe('Xone')
  })
})

describe('pos and range', () => {
  it('are the numbers they were given', () => {
    expect(pos(3)).toBe(3)
    expect(range(1, 6)).toEqual({ from: 1, to: 6 })
  })

  it('work wherever a position is taken', () => {
    const it_ = editor('<p>hello world</p>')
    expect(it_.commands.replace(range(1, 6), 'goodbye')).toBe(true)
    expect(it_.getText()).toBe('goodbye world')
    expect(it_.commands.select(pos(1))).toBe(true)
  })
})

describe('the element option', () => {
  it('mounts without a second call', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const it_ = createEditor({ extensions: starterKit, content: '<p>hi</p>', element })

    expect(element.getAttribute('contenteditable')).toBe('true')
    expect(element.textContent).toContain('hi')
    it_.destroy()
  })

  it('is the same as mounting by hand', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const it_ = createEditor({ extensions: starterKit, content: '<p>hi</p>', element })
    expect(() => it_.mount(element)).toThrow(/already mounted/)
    it_.destroy()
  })
})
