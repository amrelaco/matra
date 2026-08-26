/**
 * Solid's lifecycle helpers only run inside a reactive root, so every test
 * here wraps in `createRoot` and disposes it explicitly — which is also the
 * only way to check that disposing really does destroy the editor.
 */
import { starterKit } from '@matrajs/core'
import type { Pos } from '@matrajs/core'
import { createRoot } from 'solid-js'
import { describe, expect, it } from 'vitest'
import { createMatra } from './index'

const host = () => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

describe('createMatra()', () => {
  it('makes an editor before anything is on screen', () => {
    createRoot((dispose) => {
      const { editor } = createMatra({ extensions: starterKit, content: '<p>hello</p>' })
      expect(editor.getText()).toBe('hello')
      dispose()
    })
  })

  it('mounts through the ref, and disposing takes it down', () => {
    const element = host()
    createRoot((dispose) => {
      const { mount } = createMatra({ extensions: starterKit, content: '<p>hello</p>' })
      mount(element)
      expect(element.textContent).toBe('hello')
      expect(element.getAttribute('contenteditable')).toBe('true')

      dispose()
      expect(element.hasAttribute('contenteditable')).toBe(false)
    })
  })

  it('refuses to mount twice into one element', () => {
    const element = host()
    createRoot((dispose) => {
      const { mount } = createMatra({ extensions: starterKit, content: '<p>hi</p>' })
      mount(element)
      mount(element)
      expect(element.querySelectorAll('p').length).toBe(1)
      dispose()
    })
  })

  it('re-runs a reader when the document changes', () => {
    createRoot((dispose) => {
      const { editor, state } = createMatra({ extensions: starterKit, content: '<p>a</p>' })

      // The accessor returns the editor itself, which never changes identity —
      // so what has to change is the version behind it.
      expect(state().getText()).toBe('a')
      editor.commands.select(1 as Pos)
      editor.commands.insert('b')
      expect(state().getText()).toBe('ba')

      dispose()
    })
  })

  it('re-runs a reader when only the selection moves', () => {
    createRoot((dispose) => {
      const { editor, state } = createMatra({
        extensions: starterKit,
        content: '<p><strong>bold</strong> plain</p>',
      })

      editor.commands.select({ from: 1 as Pos, to: 4 as Pos })
      expect(state().isActive('bold')).toBe(true)

      editor.commands.select({ from: 7 as Pos, to: 10 as Pos })
      expect(state().isActive('bold')).toBe(false)

      dispose()
    })
  })
})
