import { describe, expect, it, vi } from 'vitest'
import { Schema } from '../model/schema'
import { EditorState } from '../state/state'
import type { Transaction } from '../state/transaction'
import { applyIntent } from './input'
import { Renderer } from './render'
import { readSelection, writeSelection } from './selection-sync'
import { EditorView } from './view'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      toDOM: () => ['p', 0],
      parseDOM: [{ tag: 'p' }],
    },
    {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
      parseDOM: [{ tag: 'h1', attrs: { level: 1 } }],
    },
    { name: 'text', group: 'inline' },
  ],
  marks: [{ name: 'bold', toDOM: () => ['strong', 0], parseDOM: [{ tag: 'strong' }] }],
})

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const docOf = (...text: string[]) => schema.node('doc', null, text.map(p))
const stateOf = (doc = docOf('hello world')) => EditorState.create({ schema, doc })

const mount = (state = stateOf()) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  let current = state
  const view = new EditorView(element, schema, {
    state,
    dispatchTransaction: (tr) => {
      current = current.apply(tr)
      view.updateState(current)
    },
  })
  return {
    view,
    element,
    get state() {
      return current
    },
  }
}

describe('rendering', () => {
  it('renders the document into the element', () => {
    const { element } = mount()
    expect(element.innerHTML).toBe('<p>hello world</p>')
  })

  it('renders marks', () => {
    const bold = schema.mark('bold')
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('a', [bold]), schema.text('b')]),
    ])
    const { element } = mount(stateOf(doc))
    expect(element.innerHTML).toBe('<p><strong>a</strong>b</p>')
  })

  it('makes the element editable and announces itself', () => {
    const { element } = mount()
    expect(element.getAttribute('contenteditable')).toBe('true')
    expect(element.getAttribute('role')).toBe('textbox')
  })

  it('stops being editable when told', () => {
    const { view, element } = mount()
    view.setEditable(false)
    expect(element.getAttribute('contenteditable')).toBe('false')
  })

  it('cleans up after itself', () => {
    const { view, element } = mount()
    view.destroy()
    expect(element.hasAttribute('contenteditable')).toBe(false)
  })
})

describe('position mapping through the DOM', () => {
  it('finds a model position from a DOM position', () => {
    const renderer = new Renderer(schema)
    const element = document.createElement('div')
    const doc = docOf('hello')
    renderer.render(doc, element)

    const textNode = element.querySelector('p')?.firstChild as globalThis.Node
    expect(renderer.map.posFromDOM(element, textNode, 0)).toBe(1)
    expect(renderer.map.posFromDOM(element, textNode, 3)).toBe(4)
  })

  it('finds a DOM position from a model position', () => {
    const renderer = new Renderer(schema)
    const element = document.createElement('div')
    const doc = docOf('hello')
    renderer.render(doc, element)

    const at = renderer.map.domFromPos(doc, 3)
    expect(at?.node.nodeType).toBe(3)
    expect(at?.offset).toBe(2)
  })

  it('round-trips every position in a paragraph', () => {
    const renderer = new Renderer(schema)
    const element = document.createElement('div')
    const doc = docOf('hello')
    renderer.render(doc, element)

    for (let pos = 1; pos <= 6; pos++) {
      const at = renderer.map.domFromPos(doc, pos)
      expect(at).not.toBeNull()
      const back = renderer.map.posFromDOM(
        element,
        at?.node as globalThis.Node,
        at?.offset ?? 0,
      )
      expect(back).toBe(pos)
    }
  })

  it('handles positions inside a mark wrapper', () => {
    const bold = schema.mark('bold')
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('ab', [bold])]),
    ])
    const renderer = new Renderer(schema)
    const element = document.createElement('div')
    renderer.render(doc, element)

    const at = renderer.map.domFromPos(doc, 2)
    expect(at?.node.nodeType).toBe(3)
    expect(renderer.map.posFromDOM(element, at?.node as globalThis.Node, at?.offset ?? 0)).toBe(
      2,
    )
  })
})

describe('input intents', () => {
  it('inserts typed text', () => {
    const state = stateOf(docOf('ab'))
    const tr = applyIntent(state, schema, { type: 'insertText', data: 'X', from: 2, to: 2 })
    expect(tr?.doc.textContent).toBe('aXb')
    expect(tr?.selection.from).toBe(3)
  })

  it('replaces a selection when typing over it', () => {
    const state = stateOf(docOf('abc'))
    const tr = applyIntent(state, schema, { type: 'insertText', data: 'X', from: 2, to: 4 })
    expect(tr?.doc.textContent).toBe('aX')
  })

  it('deletes backwards from a caret', () => {
    const state = stateOf(docOf('abc'))
    const tr = applyIntent(state, schema, {
      type: 'deleteContentBackward',
      data: null,
      from: 3,
      to: 3,
    })
    expect(tr?.doc.textContent).toBe('ac')
    expect(tr?.selection.from).toBe(2)
  })

  it('deletes forwards from a caret', () => {
    const state = stateOf(docOf('abc'))
    const tr = applyIntent(state, schema, {
      type: 'deleteContentForward',
      data: null,
      from: 2,
      to: 2,
    })
    expect(tr?.doc.textContent).toBe('ac')
  })

  it('does nothing at the very start when deleting backwards', () => {
    const state = stateOf(docOf('abc'))
    const tr = applyIntent(state, schema, {
      type: 'deleteContentBackward',
      data: null,
      from: 0,
      to: 0,
    })
    expect(tr).toBeNull()
  })

  it('splits a block on Enter', () => {
    const state = stateOf(docOf('hello'))
    const tr = applyIntent(state, schema, {
      type: 'insertParagraph',
      data: null,
      from: 3,
      to: 3,
    })
    expect(tr?.doc.childCount).toBe(2)
    expect(tr?.doc.child(0).textContent).toBe('he')
    expect(tr?.doc.child(1).textContent).toBe('llo')
    // doc(p"he" p"llo"): the second block opens at 4, its content starts at 5.
    expect(tr?.selection.from).toBe(5)
  })

  it('keeps the block type when splitting', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 1 }, [schema.text('hi')]),
    ])
    const state = stateOf(doc)
    const tr = applyIntent(state, schema, {
      type: 'insertParagraph',
      data: null,
      from: 2,
      to: 2,
    })
    expect(tr?.doc.child(0).type.name).toBe('heading')
    expect(tr?.doc.child(1).type.name).toBe('heading')
  })

  it('carries stored marks into typed text', () => {
    let state = stateOf(docOf('ab'))
    const mark = state.tr
    mark.addStoredMark(schema.mark('bold'))
    state = state.apply(mark)

    const tr = applyIntent(state, schema, { type: 'insertText', data: 'X', from: 2, to: 2 })
    const inserted = tr?.doc.child(0).child(1)
    expect(inserted?.marks.map((m) => m.type.name)).toEqual(['bold'])
  })

  it('lets a handler claim the input', () => {
    const state = stateOf(docOf('ab'))
    const onTextInput = vi.fn(() => true)
    const tr = applyIntent(
      state,
      schema,
      { type: 'insertText', data: 'X', from: 2, to: 2 },
      { onTextInput },
    )
    expect(tr).toBeNull()
    expect(onTextInput).toHaveBeenCalledWith('X', 2, 2)
  })

  it('ignores intents it does not understand', () => {
    const state = stateOf(docOf('ab'))
    expect(
      applyIntent(state, schema, { type: 'formatBold', data: null, from: 1, to: 2 }),
    ).toBeNull()
  })
})

describe('selection sync', () => {
  it('writes the model selection into the DOM and reads it back', () => {
    const renderer = new Renderer(schema)
    const element = document.createElement('div')
    document.body.appendChild(element)
    const doc = docOf('hello')
    renderer.render(doc, element)

    const state = EditorState.create({ schema, doc })
    const tr = state.tr
    tr.selectAt(3)
    const moved = state.apply(tr)

    writeSelection(element, renderer.map, doc, moved.selection)
    const readBack = readSelection(element, renderer.map, doc)
    expect(readBack?.from).toBe(3)
  })
})

describe('the view as a whole', () => {
  it('re-renders when the state changes', () => {
    const harness = mount()
    const tr = harness.state.tr
    tr.replaceWith(1, 1, schema.text('X'))
    ;(
      harness.view as unknown as { options: { dispatchTransaction(t: Transaction): void } }
    ).options?.dispatchTransaction?.(tr)
    expect(harness.element.innerHTML).toBe('<p>Xhello world</p>')
  })
})
