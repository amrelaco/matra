import { describe, expect, it } from 'vitest'
import { ResolvedPos } from './resolved-pos'
import { Schema } from './schema'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    { name: 'paragraph', content: 'inline*', group: 'block' },
    { name: 'blockquote', content: 'block+', group: 'block' },
    { name: 'listItem', content: 'paragraph block*' },
    { name: 'bulletList', content: 'listItem+', group: 'block' },
    { name: 'horizontalRule', group: 'block' },
    { name: 'text', group: 'inline' },
  ],
  marks: [{ name: 'bold' }, { name: 'italic' }],
})

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])

//  doc(p("ab"), p("cd"))
//  0     1  2  3     5  6  7
const doc = schema.node('doc', null, [p('ab'), p('cd')])
const at = (pos: number) => ResolvedPos.resolve(doc, pos)

describe('resolving', () => {
  it('reports depth and parent', () => {
    expect(at(0).depth).toBe(0)
    expect(at(0).parent.type.name).toBe('doc')
    expect(at(2).depth).toBe(1)
    expect(at(2).parent.type.name).toBe('paragraph')
  })

  it('measures the offset inside the parent', () => {
    expect(at(1).parentOffset).toBe(0)
    expect(at(2).parentOffset).toBe(1)
    expect(at(3).parentOffset).toBe(2)
  })

  it('knows where a node starts and ends', () => {
    const $pos = at(2)
    expect($pos.start(1)).toBe(1)
    expect($pos.end(1)).toBe(3)
    expect($pos.before(1)).toBe(0)
    expect($pos.after(1)).toBe(4)
  })

  it('refuses positions outside the document', () => {
    expect(() => at(-1)).toThrow(/outside document/)
    expect(() => at(999)).toThrow(/outside document/)
  })

  it('has nothing before or after the document itself', () => {
    expect(() => at(2).before(0)).toThrow(/before the document/)
    expect(() => at(2).after(0)).toThrow(/after the document/)
  })
})

describe('neighbours', () => {
  it('splits a text node at the cursor', () => {
    const $pos = at(2)
    expect($pos.nodeBefore?.text).toBe('a')
    expect($pos.nodeAfter?.text).toBe('b')
  })

  it('reports whole nodes at a block boundary', () => {
    const $pos = at(4)
    expect($pos.nodeBefore?.type.name).toBe('paragraph')
    expect($pos.nodeAfter?.type.name).toBe('paragraph')
  })

  it('reports nothing past the ends', () => {
    expect(at(0).nodeBefore).toBeNull()
    expect(at(doc.content.size).nodeAfter).toBeNull()
  })
})

describe('marks at a position', () => {
  const bold = schema.mark('bold')
  const marked = schema.node('doc', null, [
    schema.node('paragraph', null, [schema.text('plain'), schema.text('bold', [bold])]),
  ])

  it('inherits the marks of the text it sits inside', () => {
    const $pos = ResolvedPos.resolve(marked, 8)
    expect($pos.marks().map((m) => m.type.name)).toEqual(['bold'])
  })

  it('keeps only shared marks at a boundary between runs', () => {
    // Exactly between "plain" and "bold" — they agree on nothing.
    const $pos = ResolvedPos.resolve(marked, 6)
    expect($pos.marks()).toEqual([])
  })
})

describe('shared depth and block ranges', () => {
  const nested = schema.node('doc', null, [
    schema.node('blockquote', null, [p('one'), p('two')]),
  ])

  it('finds the depth two positions share', () => {
    const $a = ResolvedPos.resolve(nested, 3)
    const $b = ResolvedPos.resolve(nested, 8)
    // Both live inside the blockquote, in different paragraphs.
    expect($a.sharedDepth($b)).toBe(1)
  })

  it('covers a span that can be wrapped as a unit', () => {
    const $a = ResolvedPos.resolve(nested, 3)
    const $b = ResolvedPos.resolve(nested, 8)
    const range = $a.blockRange($b)
    expect(range?.depth).toBe(1)
    expect(range?.start).toBe(1)
    expect(range?.end).toBe(11)
  })

  it('honours a predicate when choosing the depth', () => {
    const $a = ResolvedPos.resolve(nested, 3)
    const range = $a.blockRange($a, (node) => node.type.name === 'doc')
    expect(range?.depth).toBe(0)
  })

  it('returns null when no depth satisfies the predicate', () => {
    const $a = ResolvedPos.resolve(nested, 3)
    expect($a.blockRange($a, (node) => node.type.name === 'nothing')).toBeNull()
  })
})
