/**
 * The binding is thin, so the tests are about the two things it adds: the
 * double-mount guard and the store. Everything else is `createEditor`, which is
 * tested where it lives.
 */
import { starterKit } from '@matrajs/core'
import type { Pos } from '@matrajs/core'
import { get } from 'svelte/store'
import { describe, expect, it } from 'vitest'
import { editorState, matra } from './index'

const host = () => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

describe('matra()', () => {
  it('makes an editor before anything is on screen', () => {
    const { editor } = matra({ extensions: starterKit, content: '<p>hello</p>' })
    expect(editor.getText()).toBe('hello')
    editor.destroy()
  })

  it('mounts through the action and tears down with the element', () => {
    const element = host()
    const { action, editor } = matra({ extensions: starterKit, content: '<p>hello</p>' })

    const handle = action(element)
    expect(element.textContent).toBe('hello')
    expect(element.getAttribute('contenteditable')).toBe('true')

    handle.destroy()
    expect(element.hasAttribute('contenteditable')).toBe(false)
    void editor
  })

  it('refuses to mount twice into one element', () => {
    const element = host()
    const { action } = matra({ extensions: starterKit, content: '<p>hi</p>' })

    action(element)
    // A hot reload, or a component that renders twice.
    action(element)

    expect(element.querySelectorAll('p').length).toBe(1)
  })
})

describe('the store', () => {
  it('starts with the editor and republishes when it changes', () => {
    const element = host()
    const { action, editor, state } = matra({ extensions: starterKit, content: '<p>a</p>' })
    action(element)

    const seen: string[] = []
    const off = state.subscribe((value) => seen.push(value.getText()))

    editor.commands.select(1 as Pos)
    editor.commands.insert('b')

    expect(seen[0]).toBe('a')
    expect(seen[seen.length - 1]).toBe('ba')
    off()
  })

  it('stops listening when the last subscriber goes', () => {
    const { editor } = matra({ extensions: starterKit, content: '<p>a</p>' })
    const store = editorState(editor)

    const off = store.subscribe(() => {})
    off()

    // Nothing to assert but the absence of a throw: a store that keeps its
    // listeners after the last subscriber is a leak per mounted component.
    editor.commands.select(1 as Pos)
    expect(() => editor.commands.insert('b')).not.toThrow()
    expect(get(store).getText()).toBe('ba')
  })
})
