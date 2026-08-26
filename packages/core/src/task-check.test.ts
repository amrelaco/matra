/**
 * Ticking a box has to change the document.
 *
 * It did not, for a long time, and nothing said so: `toggleTaskItem` reached
 * for `setBlockType`, which only touches textblocks. A checklist item holds
 * blocks, so the command was refused every single time and returned false into
 * a node view that ignored the answer. The box appeared to tick, the strike
 * never appeared, and whatever you saved still said unchecked.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import { taskItem, taskList } from './extensions/task-list'
import type { Pos } from './types'

const mount = (checked = false) => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = createEditor({
    extensions: [...starterKit, taskList, taskItem],
    content: `<ul data-type="taskList"><li data-checked="${checked}"><p>Do it</p></li></ul>`,
  })
  editor.mount(host)
  return { editor, host }
}

const box = (host: HTMLElement) =>
  host.querySelector('input[type=checkbox]') as HTMLInputElement

const click = (host: HTMLElement) => {
  const input = box(host)
  input.checked = !input.checked
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('the checkbox', () => {
  it('writes the attribute into the document', () => {
    const { editor, host } = mount(false)
    click(host)
    expect(editor.getHTML()).toContain('data-checked="true"')
  })

  it('writes it into the DOM, which is what the strike-through hangs off', () => {
    const { host } = mount(false)
    click(host)
    expect(host.querySelector('li')?.getAttribute('data-checked')).toBe('true')
  })

  it('unticks again', () => {
    const { editor, host } = mount(true)
    click(host)
    expect(editor.getHTML()).toContain('data-checked="false"')
  })

  it('survives a round trip through JSON', () => {
    const { editor, host } = mount(false)
    click(host)
    const json = JSON.stringify(editor.getJSON())
    expect(json).toContain('"checked":true')
  })

  it('leaves the text alone', () => {
    const { editor, host } = mount(false)
    click(host)
    expect(editor.getText()).toBe('Do it')
  })

  it('ticking one item does not drag the caret out of another', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = createEditor({
      extensions: [...starterKit, taskList, taskItem],
      content:
        '<ul data-type="taskList">' +
        '<li data-checked="false"><p>one</p></li>' +
        '<li data-checked="false"><p>two</p></li>' +
        '</ul>',
    })
    editor.mount(host)
    editor.commands.select(4 as Pos)

    const second = host.querySelectorAll('input')[1] as HTMLInputElement
    second.checked = true
    second.dispatchEvent(new Event('change', { bubbles: true }))

    // The view used to move the selection onto the item it was about to change,
    // because that was the only way to reach the command. Tick a box halfway
    // down a list and your cursor went with it.
    editor.commands.insert('X')
    expect(editor.getText()).toBe('oXne\ntwo')
    expect(editor.getHTML()).toContain('<li data-checked="true"')
  })

  it('updates the view in place rather than rebuilding it', () => {
    const { host } = mount(false)
    const before = box(host)
    click(host)
    // The same input element, still on screen. A rebuild here would drop
    // whatever the view was holding — and on a long list, one per tick.
    expect(box(host)).toBe(before)
    expect(before.checked).toBe(true)
  })

  it('Mod-Enter does the same thing as the mouse', () => {
    const { editor } = mount(false)
    editor.commands.select(4 as Pos)
    const commands = editor.commands as unknown as Record<string, () => boolean>
    expect(commands.toggleTaskItem?.()).toBe(true)
    expect(editor.getHTML()).toContain('data-checked="true"')
  })
})
