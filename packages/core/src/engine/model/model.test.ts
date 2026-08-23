import { describe, expect, it } from 'vitest'
import { Fragment } from './fragment'
import { Mark } from './mark'
import { Schema } from './schema'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    { name: 'paragraph', content: 'inline*', group: 'block' },
    { name: 'heading', content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    { name: 'blockquote', content: 'block+', group: 'block' },
    { name: 'listItem', content: 'paragraph block*' },
    { name: 'bulletList', content: 'listItem+', group: 'block' },
    { name: 'image', group: 'inline', inline: true, attrs: { src: { required: true } } },
    { name: 'horizontalRule', group: 'block' },
    { name: 'codeBlock', content: 'text*', group: 'block', marks: '' },
    { name: 'text', group: 'inline' },
  ],
  marks: [
    { name: 'link', excludes: 'link' },
    { name: 'bold' },
    { name: 'code', excludes: '_' },
  ],
})

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])

describe('nodes', () => {
  it('measures size the way positions expect', () => {
    expect(schema.text('hello').nodeSize).toBe(5)
    // paragraph = open + text + close
    expect(p('hello').nodeSize).toBe(7)
    expect(schema.node('horizontalRule').nodeSize).toBe(1)
  })

  it('classifies types', () => {
    expect(schema.nodes.paragraph?.isTextblock).toBe(true)
    expect(schema.nodes.blockquote?.isTextblock).toBe(false)
    expect(schema.nodes.horizontalRule?.isLeaf).toBe(true)
    expect(schema.nodes.image?.isInline).toBe(true)
    expect(schema.nodes.text?.isInline).toBe(true)
  })

  it('round-trips through JSON', () => {
    const doc = schema.node('doc', null, [
      p('hello'),
      schema.node('heading', { level: 2 }, [schema.text('hi')]),
    ])
    const back = schema.nodeFromJSON(doc.toJSON())
    expect(back.eq(doc)).toBe(true)
    expect(back.toJSON()).toEqual(doc.toJSON())
  })

  it('reads text with block separators', () => {
    const doc = schema.node('doc', null, [p('one'), p('two')])
    expect(doc.textContent).toBe('onetwo')
    expect(doc.textBetween(0, doc.content.size, '\n')).toBe('one\ntwo')
  })

  it('demands a required attribute instead of inventing one', () => {
    expect(() => schema.node('image')).toThrow(/requires the attribute "src"/)
    expect(schema.node('image', { src: 'a.png' }).attrs.src).toBe('a.png')
  })

  it('walks descendants with their positions', () => {
    const doc = schema.node('doc', null, [p('ab'), p('cd')])
    const seen: Array<[string, number]> = []
    doc.descendants((node, pos) => {
      seen.push([node.type.name, pos])
      return undefined
    })
    expect(seen).toEqual([
      ['paragraph', 0],
      ['text', 1],
      ['paragraph', 4],
      ['text', 5],
    ])
  })
})

describe('fragments', () => {
  it('merges adjacent text sharing marks', () => {
    const fragment = Fragment.from([schema.text('foo'), schema.text('bar')])
    expect(fragment.childCount).toBe(1)
    expect(fragment.child(0).text).toBe('foobar')
  })

  it('keeps differently marked text apart', () => {
    const bold = schema.mark('bold')
    const fragment = Fragment.from([schema.text('foo'), schema.text('bar', [bold])])
    expect(fragment.childCount).toBe(2)
  })

  it('drops empty text', () => {
    expect(Fragment.from([schema.text('')]).childCount).toBe(0)
  })

  it('cuts across a text boundary', () => {
    const fragment = Fragment.from([schema.text('hello world')])
    expect(fragment.cut(0, 5).child(0).text).toBe('hello')
    expect(fragment.cut(6, 11).child(0).text).toBe('world')
  })

  it('finds the child holding a position', () => {
    const fragment = Fragment.from([p('ab'), p('cd')])
    expect(fragment.findIndex(0)).toEqual({ index: 0, offset: 0 })
    expect(fragment.findIndex(4)).toEqual({ index: 1, offset: 4 })
  })
})

describe('marks', () => {
  it('keeps a set in rank order', () => {
    const link = schema.mark('link', {})
    const bold = schema.mark('bold')
    const set = bold.addToSet(link.addToSet(Mark.none))
    expect(set.map((m) => m.type.name)).toEqual(['link', 'bold'])
  })

  it('never adds the same mark twice', () => {
    const bold = schema.mark('bold')
    expect(bold.addToSet(bold.addToSet(Mark.none))).toHaveLength(1)
  })

  it('honours exclusion', () => {
    const code = schema.mark('code')
    const bold = schema.mark('bold')
    // code excludes everything, so nothing survives beside it
    expect(code.addToSet([bold]).map((m) => m.type.name)).toEqual(['code'])
    expect(bold.addToSet([code]).map((m) => m.type.name)).toEqual(['code'])
  })

  it('reports which marks a node allows', () => {
    expect(schema.nodes.codeBlock?.allowsMarkType(schema.marks.bold as never)).toBe(false)
    expect(schema.nodes.paragraph?.allowsMarkType(schema.marks.bold as never)).toBe(true)
  })
})

describe('content validation', () => {
  it('accepts and rejects content against the expression', () => {
    const doc = schema.nodes.doc
    expect(doc?.validContent(Fragment.from([p('x')]))).toBe(true)
    expect(doc?.validContent(Fragment.empty)).toBe(false)
    expect(doc?.validContent(Fragment.from([schema.text('x')]))).toBe(false)
  })

  it('fills a node so it is legal', () => {
    // listItem needs a paragraph first; createAndFill supplies one.
    const item = schema.nodes.listItem?.createAndFill()
    expect(item?.childCount).toBe(1)
    expect(item?.firstChild?.type.name).toBe('paragraph')
    expect(schema.nodes.listItem?.validContent(item?.content as Fragment)).toBe(true)
  })

  it('fills the document root', () => {
    const doc = schema.nodes.doc?.createAndFill()
    expect(doc?.firstChild?.type.name).toBe('paragraph')
  })

  it('refuses when the gap needs an attribute it cannot invent', () => {
    const strict = new Schema({
      nodes: [
        { name: 'doc', content: 'figure' },
        { name: 'figure', content: 'text*', attrs: { src: { required: true } } },
        { name: 'text' },
      ],
    })
    expect(strict.nodes.doc?.createAndFill()).toBeNull()
  })
})

describe('schema errors', () => {
  it('names the missing root', () => {
    expect(() => new Schema({ nodes: [{ name: 'text' }] })).toThrow(/no "doc" node/)
  })

  it('names an unknown type in a content expression', () => {
    expect(
      () => new Schema({ nodes: [{ name: 'doc', content: 'nope+' }, { name: 'text' }] }),
    ).toThrow(/not a node or group/)
  })

  it('rejects duplicates', () => {
    expect(
      () =>
        new Schema({
          nodes: [{ name: 'doc', content: 'text*' }, { name: 'doc' }, { name: 'text' }],
        }),
    ).toThrow(/duplicate node type/)
  })
})
