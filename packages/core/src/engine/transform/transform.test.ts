import { describe, expect, it } from 'vitest'
import { Fragment } from '../model/fragment'
import { Schema } from '../model/schema'
import { Slice } from './slice'
import { Transform } from './transform'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    { name: 'paragraph', content: 'inline*', group: 'block' },
    { name: 'heading', content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    { name: 'text', group: 'inline' },
  ],
  marks: [{ name: 'bold' }, { name: 'italic' }],
})

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const docOf = (...text: string[]) => schema.node('doc', null, text.map(p))

describe('replacing', () => {
  it('inserts text inside a paragraph', () => {
    const tr = new Transform(docOf('hello'))
    tr.replaceWith(3, 3, schema.text('XX'))
    expect(tr.doc.textContent).toBe('heXXllo')
  })

  it('deletes a range', () => {
    const tr = new Transform(docOf('hello'))
    tr.delete(2, 4)
    expect(tr.doc.textContent).toBe('hlo')
  })

  it('replaces a range with new text', () => {
    const tr = new Transform(docOf('the quick fox'))
    // "quick" occupies 5..10 inside the paragraph
    tr.replaceWith(5, 10, schema.text('nimble'))
    expect(tr.doc.textContent).toBe('the nimble fox')
  })

  it('joins two paragraphs when a delete crosses the boundary', () => {
    // doc(p"one" p"two"): "o" ends at 2, "t" ends at 7.
    // Removing 2..7 takes "ne", the boundary, and "t" — leaving "o" + "wo".
    const tr = new Transform(docOf('one', 'two'))
    tr.delete(2, 7)
    expect(tr.doc.childCount).toBe(1)
    expect(tr.doc.textContent).toBe('owo')
  })

  it('deletes from a block boundary into the next block', () => {
    // Position 5 sits between the paragraphs; 7 is after "t" in the second.
    const tr = new Transform(docOf('one', 'two'))
    tr.delete(5, 7)
    expect(tr.doc.childCount).toBe(2)
    expect(tr.doc.child(0).textContent).toBe('one')
    expect(tr.doc.child(1).textContent).toBe('wo')
  })

  it('deletes from inside a block to a boundary', () => {
    const tr = new Transform(docOf('one', 'two'))
    tr.delete(2, 5)
    expect(tr.doc.childCount).toBe(2)
    expect(tr.doc.child(0).textContent).toBe('o')
    expect(tr.doc.child(1).textContent).toBe('two')
  })

  it('removes whole blocks between two boundaries', () => {
    const tr = new Transform(docOf('one', 'two', 'three'))
    tr.delete(5, 10)
    expect(tr.doc.childCount).toBe(2)
    expect(tr.doc.child(0).textContent).toBe('one')
    expect(tr.doc.child(1).textContent).toBe('three')
  })

  it('refuses a replacement the schema forbids', () => {
    const tr = new Transform(docOf('hello'))
    // A paragraph cannot hold another paragraph.
    expect(
      tr.maybeStep({
        apply: () => ({ failed: 'nope' }),
        getMap: () => ({}) as never,
        invert: () => ({}) as never,
        toJSON: () => ({}),
      } as never),
    ).toBe(false)
    expect(tr.doc.textContent).toBe('hello')
  })

  it('rejects a range past the end of the document', () => {
    const tr = new Transform(docOf('hi'))
    expect(() => tr.delete(0, 999)).toThrow(/past the end/)
  })

  it('rejects a backwards range', () => {
    expect(() => new Transform(docOf('hi')).delete(5, 1)).toThrow(/after to/)
  })
})

describe('marks', () => {
  it('marks part of a text node, splitting it', () => {
    const tr = new Transform(docOf('hello world'))
    tr.addMark(1, 6, schema.mark('bold'))
    const paragraph = tr.doc.child(0)
    expect(paragraph.childCount).toBe(2)
    expect(paragraph.child(0).text).toBe('hello')
    expect(paragraph.child(0).marks.map((m) => m.type.name)).toEqual(['bold'])
    expect(paragraph.child(1).marks).toEqual([])
  })

  it('removes a mark again, rejoining the text', () => {
    const tr = new Transform(docOf('hello world'))
    tr.addMark(1, 6, schema.mark('bold'))
    tr.removeMark(1, 6, schema.mark('bold'))
    expect(tr.doc.child(0).childCount).toBe(1)
    expect(tr.doc.child(0).child(0).text).toBe('hello world')
  })

  it('leaves positions alone', () => {
    const tr = new Transform(docOf('hello world'))
    tr.addMark(1, 6, schema.mark('bold'))
    expect(tr.mapping.map(9)).toBe(9)
  })
})

describe('mapping through a transform', () => {
  it('brings a later position forward past an insertion', () => {
    const tr = new Transform(docOf('the quick fox'))
    const beforeFox = 11
    tr.replaceWith(1, 1, schema.text('WAIT '))
    expect(tr.mapping.map(beforeFox)).toBe(beforeFox + 5)
    expect(tr.doc.textContent).toBe('WAIT the quick fox')
  })

  it('is the mechanism behind a late edit landing correctly', () => {
    const tr = new Transform(docOf('the quick brown fox'))
    // Capture "quick" before anything else happens.
    const target = { from: 5, to: 10 }

    // The user types at the start while the model is thinking.
    tr.replaceWith(1, 1, schema.text('WAIT '))

    // The answer arrives against the stale range.
    const mapped = { from: tr.mapping.map(target.from), to: tr.mapping.map(target.to) }
    tr.replaceWith(mapped.from, mapped.to, schema.text('nimble'))

    expect(tr.doc.textContent).toBe('WAIT the nimble brown fox')
  })

  it('accumulates one map per step', () => {
    const tr = new Transform(docOf('hello'))
    tr.replaceWith(1, 1, schema.text('a'))
    tr.replaceWith(1, 1, schema.text('b'))
    expect(tr.steps).toHaveLength(2)
    expect(tr.mapping.length).toBe(2)
  })
})

describe('inverting', () => {
  it('rewinds a single change exactly', () => {
    const original = docOf('hello world')
    const tr = new Transform(original)
    tr.delete(1, 6)
    expect(tr.doc.textContent).toBe(' world')

    const back = new Transform(tr.doc)
    for (const step of tr.invert()) back.step(step)
    expect(back.doc.eq(original)).toBe(true)
  })

  it('rewinds several changes in the right order', () => {
    const original = docOf('one', 'two')
    const tr = new Transform(original)
    tr.replaceWith(1, 1, schema.text('X'))
    tr.addMark(1, 3, schema.mark('bold'))
    tr.delete(6, 8)

    const back = new Transform(tr.doc)
    for (const step of tr.invert()) back.step(step)
    expect(back.doc.eq(original)).toBe(true)
  })

  it('rewinds every boundary shape', () => {
    const original = docOf('one', 'two', 'three')
    for (const [from, to] of [
      [2, 7],
      [5, 7],
      [2, 5],
      [5, 10],
    ] as const) {
      const tr = new Transform(original)
      tr.delete(from, to)
      const back = new Transform(tr.doc)
      for (const step of tr.invert()) back.step(step)
      expect(back.doc.eq(original)).toBe(true)
    }
  })

  it('rewinds a mark change', () => {
    const original = docOf('hello')
    const tr = new Transform(original)
    tr.addMark(1, 4, schema.mark('bold'))
    const back = new Transform(tr.doc)
    for (const step of tr.invert()) back.step(step)
    expect(back.doc.eq(original)).toBe(true)
  })
})

describe('slices', () => {
  it('measures size without the open ends', () => {
    const slice = new Slice(Fragment.from([schema.text('abc')]), 0, 0)
    expect(slice.size).toBe(3)
  })

  it('compares by value', () => {
    const a = new Slice(Fragment.from([schema.text('x')]))
    const b = new Slice(Fragment.from([schema.text('x')]))
    expect(a.eq(b)).toBe(true)
  })
})
