import { describe, expect, it } from 'vitest'
import { Schema } from '../model/schema'
import { Plugin } from './plugin'
import { NodeSelection, TextSelection } from './selection'
import { EditorState } from './state'
import type { Transaction } from './transaction'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    { name: 'paragraph', content: 'inline*', group: 'block' },
    { name: 'horizontalRule', group: 'block' },
    { name: 'text', group: 'inline' },
  ],
  marks: [{ name: 'bold' }],
})

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const docOf = (...text: string[]) => schema.node('doc', null, text.map(p))
const stateOf = (doc = docOf('hello world'), plugins: Plugin[] = []) =>
  EditorState.create({ schema, doc, plugins })

describe('creating state', () => {
  it('starts with a caret at the first text position', () => {
    const state = stateOf()
    expect(state.selection.empty).toBe(true)
    expect(state.selection.from).toBe(1)
  })

  it('builds an empty document when given none', () => {
    const state = EditorState.create({ schema })
    expect(state.doc.childCount).toBe(1)
    expect(state.doc.child(0).type.name).toBe('paragraph')
  })
})

describe('selections', () => {
  it('snaps to a position text can occupy', () => {
    const doc = schema.node('doc', null, [schema.node('horizontalRule'), p('after')])
    // Position 0 is before the rule, where text cannot go.
    const selection = TextSelection.create(doc, 0)
    expect(doc.resolve(selection.from).parent.isTextblock).toBe(true)
  })

  it('moves through a change', () => {
    const state = stateOf()
    const tr = state.tr
    tr.selectAt(7)
    tr.replaceWith(1, 1, schema.text('XX'))
    expect(tr.selection.from).toBe(9)
  })

  it('survives a deletion that swallows it', () => {
    const state = stateOf()
    const tr = state.tr
    tr.selectAt(4)
    tr.delete(1, 6)
    // The caret had nowhere to be, so it lands somewhere valid rather than nowhere.
    expect(tr.selection.from).toBeGreaterThanOrEqual(0)
    expect(tr.doc.resolve(tr.selection.from).parent.isTextblock).toBe(true)
  })

  it('selects a whole leaf node', () => {
    const doc = schema.node('doc', null, [p('a'), schema.node('horizontalRule')])
    const selection = NodeSelection.create(doc, 3)
    expect(selection.node.type.name).toBe('horizontalRule')
  })

  it('falls back to a caret when the selected node goes away', () => {
    const doc = schema.node('doc', null, [p('a'), schema.node('horizontalRule')])
    const state = EditorState.create({ schema, doc, selection: NodeSelection.create(doc, 3) })
    const tr = state.tr
    tr.delete(3, 4)
    expect(tr.selection).toBeInstanceOf(TextSelection)
  })
})

describe('stored marks', () => {
  it('reports the marks the next character would take', () => {
    const state = stateOf()
    expect(state.marks).toEqual([])
  })

  it('remembers a mark toggled with an empty selection', () => {
    const state = stateOf()
    const tr = state.tr
    tr.addStoredMark(schema.mark('bold'))
    const next = state.apply(tr)
    expect(next.marks.map((m) => m.type.name)).toEqual(['bold'])
  })

  it('forgets stored marks when the caret moves', () => {
    const state = stateOf()
    const tr = state.tr
    tr.addStoredMark(schema.mark('bold'))
    tr.selectAt(5)
    expect(tr.storedMarks).toBeNull()
  })
})

describe('applying transactions', () => {
  it('returns a new state, leaving the old one intact', () => {
    const state = stateOf()
    const tr = state.tr
    tr.replaceWith(1, 1, schema.text('X'))
    const next = state.apply(tr)
    expect(next).not.toBe(state)
    expect(state.doc.textContent).toBe('hello world')
    expect(next.doc.textContent).toBe('Xhello world')
  })

  it('lets a plugin veto a transaction', () => {
    const readOnly = new Plugin({
      key: 'readOnly',
      filterTransaction: (tr) => !tr.docChanged,
    })
    const state = stateOf(docOf('hello'), [readOnly])
    const tr = state.tr
    tr.replaceWith(1, 1, schema.text('X'))
    // Identity tells the caller nothing happened.
    expect(state.apply(tr)).toBe(state)
  })
})

describe('plugin state', () => {
  const counter = new Plugin<number>({
    key: 'counter',
    state: {
      init: () => 0,
      apply: (tr, value) => (tr.docChanged ? value + 1 : value),
    },
  })

  it('initialises and folds transactions into its value', () => {
    let state = stateOf(docOf('hi'), [counter])
    expect(counter.getState(state)).toBe(0)

    const tr = state.tr
    tr.replaceWith(1, 1, schema.text('a'))
    state = state.apply(tr)
    expect(counter.getState(state)).toBe(1)

    const move = state.tr
    move.selectAt(2)
    state = state.apply(move)
    expect(counter.getState(state)).toBe(1)
  })

  it('reads metadata a caller attached', () => {
    const seen: unknown[] = []
    const listener = new Plugin({
      key: 'listener',
      state: {
        init: () => null,
        apply: (tr: Transaction) => {
          seen.push(tr.getMeta('source'))
          return null
        },
      },
    })
    const state = stateOf(docOf('hi'), [listener])
    const tr = state.tr
    tr.setMeta('source', 'paste')
    tr.replaceWith(1, 1, schema.text('x'))
    state.apply(tr)
    expect(seen).toEqual(['paste'])
  })
})
