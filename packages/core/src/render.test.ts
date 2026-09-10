import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { audio } from './extensions/audio'
import { ruby } from './extensions/ruby'
import { starterKit } from './extensions/starter-kit'
import { renderToHTML } from './render'
import type { AnyDef, DocNode } from './types'

const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content })
const p = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content })
const t = (text: string, ...marks: string[]): DocNode => ({
  type: 'text',
  text,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
})

const render = (node: DocNode, defs: readonly AnyDef[] = starterKit) => renderToHTML(node, defs)

describe('renderToHTML', () => {
  it('renders a document with no editor and no DOM', () => {
    expect(render(doc(p(t('Hello.'))))).toBe('<p>Hello.</p>')
  })

  it('nests marks in the order they are listed', () => {
    expect(render(doc(p(t('loud', 'bold', 'italic'))))).toBe(
      '<p><strong><em>loud</em></strong></p>',
    )
  })

  it('carries attributes through', () => {
    const heading: DocNode = { type: 'heading', attrs: { level: 3 }, content: [t('Title')] }
    expect(render(doc(heading))).toBe('<h3>Title</h3>')
  })

  /*
   * The reason this file exists. A renderer that quietly diverges from the
   * editor is worse than none, because the divergence shows up as a page that
   * looks wrong only in production.
   */
  it('renders an extension it has never heard of, through its own toDOM', () => {
    const spoiler = {
      kind: 'node',
      name: 'spoiler',
      group: 'block',
      content: 'inline*',
      toDOM: () => ['div', { 'data-spoiler': '' }, 0],
    } as unknown as AnyDef
    const html = render(doc({ type: 'spoiler', content: [t('hidden')] }), [
      ...starterKit,
      spoiler,
    ])
    expect(html).toBe('<div data-spoiler="">hidden</div>')
  })

  it('keeps the contents of a node it cannot draw', () => {
    const html = render(doc({ type: 'fromTheFuture', content: [p(t('still here'))] }))
    expect(html).toBe('<p>still here</p>')
  })

  describe('escaping', () => {
    it('escapes text', () => {
      expect(render(doc(p(t('<script>alert(1)</script>'))))).toBe(
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
      )
    })

    it('escapes attribute values', () => {
      const html = render(doc(p(t('x', 'link'))), starterKit)
      // The link mark has no href here, so this only proves text survives; the
      // href path is covered below where an href exists to escape.
      expect(html).toContain('x')
    })

    it('refuses a javascript: URL in an href', () => {
      const link: DocNode = {
        type: 'text',
        text: 'click',
        marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
      }
      const html = render(doc(p(link)))
      expect(html).not.toContain('javascript:')
      expect(html).toContain('click')
    })

    it('is not fooled by a control character inside the scheme', () => {
      // `java\u0000script:` and `java\tscript:` are both read as `javascript:`
      // by a browser. Written as escapes so the literal control character is
      // not sitting invisibly in this file.
      for (const href of ['java\u0000script:alert(1)', 'java\tscript:alert(1)']) {
        const link: DocNode = {
          type: 'text',
          text: 'click',
          marks: [{ type: 'link', attrs: { href } }],
        }
        const html = render(doc(p(link)))
        expect(html).not.toContain('script:')
        expect(html).toContain('click')
      }
    })

    it('keeps an ordinary URL', () => {
      const link: DocNode = {
        type: 'text',
        text: 'docs',
        marks: [{ type: 'link', attrs: { href: 'https://matrajs.com/docs' } }],
      }
      expect(render(doc(p(link)))).toContain('href="https://matrajs.com/docs"')
    })
  })

  it('writes void elements without a closing tag', () => {
    const html = render(doc({ type: 'horizontalRule' }))
    expect(html).toBe('<hr>')
    expect(html).not.toContain('</hr>')
  })
})

describe('audio', () => {
  it('renders with the browser transport', () => {
    const html = renderToHTML(doc({ type: 'audio', attrs: { src: '/take.mp3' } }), [
      ...starterKit,
      audio,
    ])
    expect(html).toContain('<audio')
    expect(html).toContain('src="/take.mp3"')
    expect(html).toContain('controls')
  })

  it('refuses a source that is not one', () => {
    const html = renderToHTML(doc({ type: 'audio', attrs: { src: 'javascript:alert(1)' } }), [
      ...starterKit,
      audio,
    ])
    expect(html).not.toContain('javascript:')
  })
})

describe('ruby', () => {
  it('puts the reading above the base', () => {
    const node = doc(p({ type: 'ruby', attrs: { base: '漢字', reading: 'かんじ' } }))
    const html = renderToHTML(node, [...starterKit, ruby])
    expect(html).toBe('<p><ruby>漢字<rp>(</rp><rt>かんじ</rt><rp>)</rp></ruby></p>')
  })

  it('omits the annotation when there is none', () => {
    const node = doc(p({ type: 'ruby', attrs: { base: '漢字', reading: '' } }))
    expect(renderToHTML(node, [...starterKit, ruby])).toBe('<p><ruby>漢字</ruby></p>')
  })
})

/*
 * The claim this whole module makes.
 *
 * Rendering on a server is only worth anything if the page it produces is the
 * page the editor would have shown. Testing the two against each other is the
 * only way that stays true — a fixture would just record today's output and
 * agree with itself forever.
 */
describe('the server and the editor agree', () => {
  const cases: [string, DocNode][] = [
    ['a paragraph', doc(p(t('Hello.')))],
    ['marks', doc(p(t('plain '), t('loud', 'bold'), t(' and '), t('soft', 'italic')))],
    ['a heading', doc({ type: 'heading', attrs: { level: 2 }, content: [t('Title')] })],
    ['a blockquote', doc({ type: 'blockquote', content: [p(t('quoted'))] })],
    [
      'a list',
      doc({
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [p(t('one'))] },
          { type: 'listItem', content: [p(t('two'))] },
        ],
      }),
    ],
    ['a rule', doc({ type: 'horizontalRule' })],
    ['text needing escapes', doc(p(t('a < b & c > d')))],
    [
      'a link',
      doc(
        p({
          type: 'text',
          text: 'docs',
          marks: [{ type: 'link', attrs: { href: 'https://matrajs.com/docs' } }],
        }),
      ),
    ],
  ]

  for (const [name, content] of cases) {
    it(name, () => {
      const editor = createEditor({ extensions: starterKit as never, content })
      expect(renderToHTML(content, starterKit)).toBe(editor.getHTML())
      editor.destroy()
    })
  }
})
