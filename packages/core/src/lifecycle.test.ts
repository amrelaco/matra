/**
 * The three lines every framework binding is wrapping.
 *
 * A Svelte action, a Solid `onMount`, an Angular directive and a React effect
 * all do the same thing: create the editor, mount it into an element, destroy
 * it when the element goes away. The documentation shows that shape for six
 * frameworks, so the shape itself is tested here — once — rather than being
 * plausible in six snippets nobody ran.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

const host = () => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

describe('the lifecycle a binding wraps', () => {
  it('mounts, edits, and leaves nothing behind when destroyed', () => {
    const element = host()
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })

    editor.mount(element)
    expect(element.getAttribute('contenteditable')).toBe('true')
    expect(element.textContent).toBe('hello')

    editor.commands.select(1 as Pos)
    editor.commands.insert('x')
    expect(element.textContent).toBe('xhello')

    editor.destroy()
    // The attribute is what a framework would otherwise leave on a recycled
    // element: a div nothing is listening to that still takes the caret.
    expect(element.hasAttribute('contenteditable')).toBe(false)
  })

  it('survives being torn down and set up again on the same element', () => {
    const element = host()

    const first = createEditor({ extensions: starterKit, content: '<p>one</p>' })
    first.mount(element)
    first.destroy()

    // A hot reload, a route change, a `<KeepAlive>` waking up.
    const second = createEditor({ extensions: starterKit, content: '<p>two</p>' })
    second.mount(element)

    expect(element.textContent).toBe('two')
    expect(element.getAttribute('contenteditable')).toBe('true')
    second.commands.select(1 as Pos)
    second.commands.insert('!')
    expect(element.textContent).toBe('!two')
  })

  it('says whether it is already mounted, which is how a guard is written', () => {
    const element = host()
    const editor = createEditor({ extensions: starterKit, content: '<p>hi</p>' })

    expect(editor.unsafe.view).toBeFalsy()
    editor.mount(element)
    expect(editor.unsafe.view).toBeTruthy()

    // The guard every binding uses · a component rendered twice must not
    // attach a second view to one element.
    if (!editor.unsafe.view) editor.mount(element)
    expect(element.querySelectorAll('p').length).toBe(1)

    editor.destroy()
  })

  it('works headless, which is what a server render gets', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>no DOM here</p>' })

    expect(editor.getText()).toBe('no DOM here')
    editor.commands.select(1 as Pos)
    expect(editor.commands.insert('yes: ')).toBe(true)
    expect(editor.getHTML()).toBe('<p>yes: no DOM here</p>')

    editor.destroy()
  })
})
