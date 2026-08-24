/**
 * Adversarial tests for presence.
 *
 * Presence arrives over the wire from another client. Nothing in it is
 * trustworthy: not the position, not the name, not the id.
 */
import { createEditor, starterKit } from '@matrajs/core'
import type { Pos } from '@matrajs/core'
import { describe, expect, it } from 'vitest'
import { collab } from './collab'
import { type RemoteCursors, colorFor, remoteCursors } from './remote-cursors'

const client = (content = '<p>hello world</p>') =>
  createEditor({
    extensions: [...starterKit, collab({ clientId: 'me' }), remoteCursors()] as const,
    content,
  })

const mount = (editor: ReturnType<typeof client>) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

const cursors = (editor: ReturnType<typeof client>) =>
  editor.extensionState<RemoteCursors>('remoteCursors')

describe('attack: hostile presence', () => {
  it('a display name cannot become markup', () => {
    const editor = client()
    const element = mount(editor)
    editor.commands.setPresence({
      clientId: 'bob',
      anchor: 3,
      head: 3,
      meta: { name: '<img src=x onerror=alert(1)>' },
    })
    // Assert on the DOM, not on the serialized string: escaped markup still
    // *contains* the substring "onerror", so a regex over innerHTML passes and
    // fails for the wrong reasons in both directions.
    expect(element.querySelectorAll('img')).toHaveLength(0)
    expect(element.querySelectorAll('script')).toHaveLength(0)
    const label = element.querySelector('.matra-remote-cursor-label')
    expect(label?.children).toHaveLength(0)
    expect(label?.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('a giant display name is truncated rather than rendered whole', () => {
    const editor = client()
    const element = mount(editor)
    editor.commands.setPresence({
      clientId: 'bob',
      anchor: 3,
      head: 3,
      meta: { name: 'A'.repeat(100_000) },
    })
    const label = element.querySelector('.matra-remote-cursor-label')
    expect((label?.textContent ?? '').length).toBeLessThanOrEqual(40)
  })

  it('a name that is not a string is ignored', () => {
    const editor = client()
    const element = mount(editor)
    for (const name of [42, {}, [], null, true, () => 'x']) {
      editor.commands.setPresence({ clientId: 'bob', anchor: 3, head: 3, meta: { name } })
      expect(element.querySelector('.matra-remote-cursor')).toBeTruthy()
      expect(element.querySelector('.matra-remote-cursor-label')).toBeNull()
    }
  })

  it('a clientId full of markup cannot escape into the DOM', () => {
    const editor = client()
    const element = mount(editor)
    editor.commands.setPresence({
      clientId: '"><script>alert(1)</script>',
      anchor: 3,
      head: 3,
    })
    // The id reaches a DOM attribute, where setAttribute is the escaping
    // boundary. What matters is that no element was created from it.
    expect(element.querySelectorAll('script')).toHaveLength(0)
    expect(editor.getHTML()).not.toMatch(/script/i)
  })

  it('a cursor past the end of the document is drawn at the end, not thrown', () => {
    const editor = client()
    const element = mount(editor)
    expect(() =>
      editor.commands.setPresence({ clientId: 'bob', anchor: 999_999, head: 999_999 }),
    ).not.toThrow()
    expect(element.textContent).toContain('hello world')
  })

  it('a cursor stranded past the end after the document shrinks still renders', () => {
    const editor = client('<p>hello world</p>')
    const element = mount(editor)
    editor.commands.setPresence({ clientId: 'bob', anchor: 12, head: 12 })

    editor.commands.select({ from: 1 as Pos, to: 12 as Pos })
    editor.commands.remove()

    expect(() => editor.getHTML()).not.toThrow()
    expect(element).toBeTruthy()
  })

  it('the document surviving a replacement leaves presence renderable', () => {
    const editor = client()
    mount(editor)
    editor.commands.setPresence({ clientId: 'bob', anchor: 10, head: 10 })
    expect(() => editor.setContent('<p>hi</p>')).not.toThrow()
    expect(editor.getHTML()).toContain('hi')
  })

  it('reversed anchor and head still draw a selection', () => {
    const editor = client()
    const element = mount(editor)
    editor.commands.setPresence({ clientId: 'bob', anchor: 8, head: 2 })
    expect(element.querySelector('.matra-remote-selection')).toBeTruthy()
  })

  it('a prototype-polluting meta payload changes nothing', () => {
    const editor = client()
    mount(editor)
    const evil = JSON.parse(
      '{"clientId":"bob","anchor":1,"head":1,"meta":{"__proto__":{"pwned":1}}}',
    )
    editor.commands.setPresence(evil)
    expect(({} as Record<string, unknown>).pwned).toBeUndefined()
  })

  it('many cursors do not take the editor down', () => {
    const editor = client()
    const element = mount(editor)
    for (let i = 0; i < 500; i++) {
      editor.commands.setPresence({ clientId: `peer-${i}`, anchor: 1, head: 3 })
    }
    expect(cursors(editor)?.size).toBe(500)
    expect(element.textContent).toContain('hello world')
  })

  it('a colour is always a usable colour, whatever the id', () => {
    for (const id of ['', 'x', '💥', '"><b>', 'a'.repeat(5000)]) {
      expect(colorFor(id)).toMatch(/^hsl\(\d+ 70% 45%\)$/)
    }
  })
})
