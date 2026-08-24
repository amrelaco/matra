import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { DecorationSpec, ExtensionDef, Pos } from './types'

const mount = (editor: ReturnType<typeof createEditor>) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

/** Highlight every occurrence of a word — the classic decoration use. */
const search = (term: string): ExtensionDef<Record<string, never>> => ({
  kind: 'extension',
  name: 'search',
  decorations: (ctx) => {
    const out: DecorationSpec[] = []
    const text = JSON.stringify(ctx.doc)
    void text
    let pos = 1
    const walk = (node: { text?: string; content?: unknown[] }): number => {
      if (typeof node.text === 'string') {
        let index = node.text.indexOf(term)
        while (index !== -1) {
          out.push({
            type: 'inline',
            from: (pos + index) as Pos,
            to: (pos + index + term.length) as Pos,
            attrs: { class: 'hit' },
          })
          index = node.text.indexOf(term, index + 1)
        }
        return node.text.length
      }
      let inner = 0
      for (const child of (node.content ?? []) as Array<{
        text?: string
        content?: unknown[]
      }>) {
        inner += walk(child)
      }
      return inner + 2
    }
    let offset = 0
    for (const child of (ctx.doc.content ?? []) as Array<{
      text?: string
      content?: unknown[]
    }>) {
      pos = offset + 1
      offset += walk(child)
    }
    return out
  },
})

describe('decorations', () => {
  it('draws an inline highlight without touching the document', () => {
    const editor = createEditor({
      extensions: [...starterKit, search('world')] as const,
      content: '<p>hello world</p>',
    })
    const element = mount(editor)

    expect(element.querySelector('.hit')?.textContent).toBe('world')
    // The document itself is untouched — that is the whole point.
    expect(editor.getHTML()).toBe('<p>hello world</p>')
  })

  it('follows the words as the text moves', () => {
    const editor = createEditor({
      extensions: [...starterKit, search('world')] as const,
      content: '<p>hello world</p>',
    })
    const element = mount(editor)

    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('OH ')

    expect(element.querySelector('.hit')?.textContent).toBe('world')
    expect(editor.getHTML()).toBe('<p>OH hello world</p>')
  })

  it('refuses to set an event handler attribute', () => {
    const nasty: ExtensionDef<Record<string, never>> = {
      kind: 'extension',
      name: 'nasty',
      decorations: () => [
        {
          type: 'inline',
          from: 1 as Pos,
          to: 3 as Pos,
          attrs: { onclick: 'alert(1)', onerror: 'alert(2)', class: 'ok' },
        },
      ],
    }
    const editor = createEditor({
      extensions: [...starterKit, nasty] as const,
      content: '<p>hello</p>',
    })
    const element = mount(editor)

    const span = element.querySelector('.ok')
    expect(span).not.toBeNull()
    expect(span?.getAttribute('onclick')).toBeNull()
    expect(span?.getAttribute('onerror')).toBeNull()
  })

  it('strips javascript from a style attribute', () => {
    const nasty: ExtensionDef<Record<string, never>> = {
      kind: 'extension',
      name: 'nasty',
      decorations: () => [
        {
          type: 'inline',
          from: 1 as Pos,
          to: 3 as Pos,
          attrs: { style: 'background: url(javascript:alert(1))', class: 'ok' },
        },
      ],
    }
    const editor = createEditor({
      extensions: [...starterKit, nasty] as const,
      content: '<p>hello</p>',
    })
    const element = mount(editor)
    expect(element.querySelector('.ok')?.getAttribute('style')).not.toContain('javascript:')
  })

  it('survives a decorator that throws', () => {
    const broken: ExtensionDef<Record<string, never>> = {
      kind: 'extension',
      name: 'broken',
      decorations: () => {
        throw new Error('boom')
      },
    }
    const editor = createEditor({
      extensions: [...starterKit, broken] as const,
      content: '<p>hello</p>',
    })
    expect(() => mount(editor)).not.toThrow()
  })

  it('renders a widget the document does not contain', () => {
    const widget: ExtensionDef<Record<string, never>> = {
      kind: 'extension',
      name: 'widget',
      decorations: () => [
        {
          type: 'widget',
          pos: 1 as Pos,
          key: 'cursor',
          render: () => {
            const el = document.createElement('span')
            el.className = 'remote-cursor'
            return el
          },
        },
      ],
    }
    const editor = createEditor({
      extensions: [...starterKit, widget] as const,
      content: '<p>hello</p>',
    })
    const element = mount(editor)

    const cursor = element.querySelector('.remote-cursor')
    expect(cursor).not.toBeNull()
    // Marked inert so the caret cannot wander into it.
    expect(cursor?.getAttribute('contenteditable')).toBe('false')
    expect(editor.getText()).toBe('hello')
  })
})
