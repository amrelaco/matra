import { describe, expect, it } from 'vitest'
import { DOMParser } from './dom-parser'
import { DOMSerializer } from './dom-serializer'
import { Fragment } from './fragment'
import { Schema } from './schema'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: { level: { default: 1 } },
      parseDOM: [
        { tag: 'h1', attrs: { level: 1 } },
        { tag: 'h2', attrs: { level: 2 } },
      ],
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    {
      name: 'blockquote',
      content: 'block+',
      group: 'block',
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    {
      name: 'horizontalRule',
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr'],
    },
    {
      name: 'image',
      group: 'inline',
      inline: true,
      attrs: { src: { required: true }, alt: { default: null } },
      parseDOM: [
        {
          tag: 'img[src]',
          getAttrs: (dom) => ({
            src: (dom as Element).getAttribute('src'),
            alt: (dom as Element).getAttribute('alt'),
          }),
        },
      ],
      toDOM: (node) => ['img', { src: node.attrs.src, alt: node.attrs.alt }],
    },
    { name: 'text', group: 'inline' },
  ],
  marks: [
    {
      name: 'link',
      excludes: 'link',
      attrs: { href: { required: true } },
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs: (dom: Element | string) => ({
            href: (dom as Element).getAttribute('href'),
          }),
        },
      ],
      toDOM: (mark) => ['a', { href: mark.attrs.href }, 0],
    },
    {
      name: 'bold',
      parseDOM: [
        { tag: 'strong' },
        { tag: 'b' },
        {
          style: 'font-weight',
          getAttrs: (v: Element | string) =>
            /^(bold|[5-9]\d{2})$/.test(v as string) ? null : false,
        },
      ],
      toDOM: () => ['strong', 0],
    },
    { name: 'italic', parseDOM: [{ tag: 'em' }], toDOM: () => ['em', 0] },
  ],
})

const serializer = DOMSerializer.fromSchema(schema)
const parser = DOMParser.fromSchema(schema)

const html = (source: string) => {
  const container = document.createElement('div')
  container.innerHTML = source
  return container
}

const roundTrip = (source: string) =>
  serializer.serializeHTML(parser.parse(html(source)).content)

describe('serializing', () => {
  it('renders a node through its toDOM', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 2 }, [schema.text('Title')]),
    ])
    expect(serializer.serializeHTML(doc.content)).toBe('<h2>Title</h2>')
  })

  it('renders attributes and skips null ones', () => {
    const image = schema.node('image', { src: 'a.png', alt: null })
    expect(serializer.serializeHTML(Fragment.from([image]))).toBe('<img src="a.png">')
  })

  it('wraps marked text', () => {
    const bold = schema.mark('bold')
    const fragment = Fragment.from([schema.text('hi', [bold])])
    expect(serializer.serializeHTML(fragment)).toBe('<strong>hi</strong>')
  })

  it('shares one element across adjacent text with the same mark', () => {
    const bold = schema.mark('bold')
    const fragment = Fragment.from([
      schema.text('a', [bold]),
      schema.text('b', [bold, schema.mark('italic')]),
    ])
    expect(serializer.serializeHTML(fragment)).toBe('<strong>a<em>b</em></strong>')
  })

  it('refuses to render a node with no toDOM', () => {
    const bare = new Schema({ nodes: [{ name: 'doc', content: 'text*' }, { name: 'text' }] })
    const doc = bare.node('doc', null, [bare.text('x')])
    expect(() => new DOMSerializer(bare).serializeNode(doc)).toThrow(/has no toDOM/)
  })
})

describe('parsing', () => {
  it('reads blocks and their attributes', () => {
    const doc = parser.parse(html('<h2>Title</h2><p>Body</p>'))
    expect(doc.childCount).toBe(2)
    expect(doc.child(0).type.name).toBe('heading')
    expect(doc.child(0).attrs.level).toBe(2)
    expect(doc.child(1).textContent).toBe('Body')
  })

  it('reads marks from tags', () => {
    const doc = parser.parse(html('<p><strong>bold</strong> plain</p>'))
    const first = doc.child(0).child(0)
    expect(first.marks.map((m) => m.type.name)).toEqual(['bold'])
  })

  it('reads marks from inline styles', () => {
    const doc = parser.parse(html('<p><span style="font-weight: bold">x</span></p>'))
    expect(
      doc
        .child(0)
        .child(0)
        .marks.map((m) => m.type.name),
    ).toEqual(['bold'])
  })

  it('descends into elements it does not recognise', () => {
    const doc = parser.parse(html('<div><section><p>kept</p></section></div>'))
    expect(doc.child(0).textContent).toBe('kept')
  })

  it('drops an element whose getAttrs refuses it', () => {
    const doc = parser.parse(html('<p><span style="font-weight: 300">x</span></p>'))
    expect(doc.child(0).child(0).marks).toEqual([])
  })

  it('collapses whitespace the way HTML does', () => {
    const doc = parser.parse(html('<p>a   \n  b</p>'))
    expect(doc.child(0).textContent).toBe('a b')
  })

  it('repairs a document with no blocks', () => {
    const doc = parser.parse(html('bare text'))
    expect(doc.childCount).toBeGreaterThan(0)
  })
})

describe('round trip', () => {
  it('survives blocks, marks and attributes', () => {
    expect(roundTrip('<h1>Title</h1><p>Body</p>')).toBe('<h1>Title</h1><p>Body</p>')
    expect(roundTrip('<p><strong>a</strong>b</p>')).toBe('<p><strong>a</strong>b</p>')
    expect(roundTrip('<blockquote><p>q</p></blockquote>')).toBe(
      '<blockquote><p>q</p></blockquote>',
    )
    expect(roundTrip('<p><a href="https://matrajs.com">link</a></p>')).toBe(
      '<p><a href="https://matrajs.com">link</a></p>',
    )
  })

  it('normalises equivalent markup', () => {
    // <b> parses to the same mark <strong> serializes.
    expect(roundTrip('<p><b>x</b></p>')).toBe('<p><strong>x</strong></p>')
  })
})
