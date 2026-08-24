import { describe, expect, it, vi } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { NodeDef, Pos } from './types'

const mount = (editor: ReturnType<typeof createEditor>) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

describe('incremental rendering', () => {
  it('leaves untouched paragraphs as the same DOM element', () => {
    const editor = createEditor({
      extensions: starterKit,
      content: '<p>one</p><p>two</p><p>three</p>',
    })
    const element = mount(editor)
    const [first, second, third] = Array.from(element.children)

    // Type in the middle paragraph — position 8 sits after "tw".
    editor.commands.select({ from: 8 as Pos, to: 8 as Pos })
    editor.commands.insert('X')

    const after = Array.from(element.children)
    expect(after[0]).toBe(first)
    expect(after[2]).toBe(third)
    // The edited one is rebuilt inside, but stays the same element.
    expect(after[1]).toBe(second)
    expect(after[1]?.textContent).toBe('twXo')
  })

  it('adds and removes only what changed', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>one</p><p>two</p>' })
    const element = mount(editor)
    const first = element.children[0]

    editor.commands.select({ from: 10 as Pos, to: 10 as Pos })
    editor.commands.insert('!')
    expect(element.children[0]).toBe(first)
    expect(element.children).toHaveLength(2)
  })

  it('keeps the document and the DOM in agreement', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    const element = mount(editor)

    editor.commands.select({ from: 6 as Pos, to: 6 as Pos })
    editor.commands.insert(' world')
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleBold()

    expect(element.innerHTML).toBe(editor.getHTML())
  })
})

describe('node views', () => {
  /** A callout that owns a button, and counts how often it is rebuilt. */
  const makeCallout = (built: () => void, destroyed: () => void): NodeDef => ({
    kind: 'node',
    name: 'callout',
    content: 'block+',
    group: 'block',
    parseDOM: [{ tag: 'aside' }],
    toDOM: () => ['aside', 0],
    nodeView: ({ node }) => {
      built()
      const dom = document.createElement('aside')
      dom.className = 'callout'
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'toggle'
      const contentDOM = document.createElement('div')
      dom.append(button, contentDOM)
      return {
        dom,
        contentDOM,
        update: (next) => (next as { type: string }).type === 'callout',
        destroy: destroyed,
        stopEvent: (event) => event.target === button,
      }
    },
  })

  it('renders through the factory', () => {
    const built = vi.fn()
    const editor = createEditor({
      extensions: [...starterKit, makeCallout(built, () => undefined)] as const,
      content: '<aside><p>note</p></aside>',
    })
    const element = mount(editor)

    expect(built).toHaveBeenCalledTimes(1)
    expect(element.querySelector('.callout button')).not.toBeNull()
    expect(element.querySelector('.callout div')?.textContent).toBe('note')
  })

  it('survives typing inside it', () => {
    const built = vi.fn()
    const destroyed = vi.fn()
    const editor = createEditor({
      extensions: [...starterKit, makeCallout(built, destroyed)] as const,
      content: '<aside><p>note</p></aside>',
    })
    const element = mount(editor)
    const view = element.querySelector('.callout')

    editor.commands.select({ from: 3 as Pos, to: 3 as Pos })
    editor.commands.insert('X')

    // The same element, not a replacement — a rebuilt view would lose focus,
    // scroll position and any half-finished interaction.
    expect(element.querySelector('.callout')).toBe(view)
    expect(built).toHaveBeenCalledTimes(1)
    expect(destroyed).not.toHaveBeenCalled()
    expect(element.querySelector('.callout div')?.textContent).toBe('nXote')
  })

  it('survives an edit somewhere else entirely', () => {
    const built = vi.fn()
    const editor = createEditor({
      extensions: [...starterKit, makeCallout(built, () => undefined)] as const,
      content: '<p>before</p><aside><p>note</p></aside>',
    })
    const element = mount(editor)
    const view = element.querySelector('.callout')

    editor.commands.select({ from: 3 as Pos, to: 3 as Pos })
    editor.commands.insert('X')

    expect(element.querySelector('.callout')).toBe(view)
    expect(built).toHaveBeenCalledTimes(1)
  })

  it('is destroyed when its node goes away', () => {
    const destroyed = vi.fn()
    const editor = createEditor({
      extensions: [...starterKit, makeCallout(() => undefined, destroyed)] as const,
      content: '<p>a</p><aside><p>note</p></aside>',
    })
    const element = mount(editor)

    // Remove the whole callout.
    editor.commands.remove({ from: 3 as Pos, to: 11 as Pos })
    expect(element.querySelector('.callout')).toBeNull()
    expect(destroyed).toHaveBeenCalled()
  })

  it('is destroyed when the editor is', () => {
    const destroyed = vi.fn()
    const editor = createEditor({
      extensions: [...starterKit, makeCallout(() => undefined, destroyed)] as const,
      content: '<aside><p>note</p></aside>',
    })
    mount(editor)
    editor.destroy()
    expect(destroyed).toHaveBeenCalled()
  })

  it('reports where it currently sits', () => {
    const positions: Array<() => number> = []
    const def: NodeDef = {
      kind: 'node',
      name: 'callout',
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'aside' }],
      toDOM: () => ['aside', 0],
      nodeView: (props) => {
        positions.push(props.getPos)
        const dom = document.createElement('aside')
        const contentDOM = document.createElement('div')
        dom.append(contentDOM)
        return { dom, contentDOM, update: () => true }
      },
    }
    const editor = createEditor({
      extensions: [...starterKit, def] as const,
      content: '<p>a</p><aside><p>note</p></aside>',
    })
    mount(editor)
    expect(positions[0]?.()).toBe(3)

    // Insert a paragraph before it; the view should report the new position.
    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('XY')
    expect(positions[0]?.()).toBe(5)
  })
})
