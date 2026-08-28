/**
 * Two serializers are allowed to exist. Two answers are not.
 *
 * `HTMLSerializer` repeats what `DOMSerializer` does without a DOM, which means
 * it also repeats the security gate — and a gate that is written twice is a gate
 * that drifts. So this does not test the string builder against a fixture of
 * what someone expected; it tests it against the DOM, on the same documents,
 * including the hostile ones, and fails on any difference at all.
 */
import { describe, expect, it } from 'vitest'
import { DOMSerializer } from './dom-serializer'
import type { Fragment } from './fragment'
import { HTMLSerializer } from './html-serializer'
import { Schema } from './schema'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    {
      name: 'paragraph',
      content: 'inline*',
      group: 'block',
      toDOM: () => ['p', 0],
    },
    {
      name: 'heading',
      content: 'inline*',
      group: 'block',
      attrs: { level: { default: 1 } },
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    {
      name: 'blockquote',
      content: 'block+',
      group: 'block',
      toDOM: () => ['blockquote', 0],
    },
    { name: 'horizontalRule', group: 'block', toDOM: () => ['hr'] },
    {
      name: 'hardBreak',
      group: 'inline',
      inline: true,
      toDOM: () => ['br'],
    },
    {
      name: 'image',
      group: 'inline',
      inline: true,
      attrs: { src: { required: true }, alt: { default: null } },
      toDOM: (node) => ['img', { src: node.attrs.src, alt: node.attrs.alt }],
    },
    // A wrapper whose content hole sits inside a child element, and which has a
    // sibling after the hole — the two shapes the string builder has to get
    // right that a flat `['p', 0]` never exercises.
    {
      name: 'figure',
      content: 'block+',
      group: 'block',
      toDOM: () => ['figure', ['div', { class: 'inner' }, 0], ['span', { class: 'after' }]],
    },
    { name: 'text', group: 'inline' },
  ],
  marks: [
    { name: 'bold', toDOM: () => ['strong', 0] },
    // No hole declared: content still goes inside, which is a mark rule and not
    // a node rule.
    { name: 'italic', toDOM: () => ['em'] },
    // No toDOM at all: both serializers fall back to a bare span.
    { name: 'plain' },
    {
      name: 'link',
      attrs: { href: { default: null }, target: { default: null }, rel: { default: null } },
      toDOM: (mark) => [
        'a',
        { href: mark.attrs.href, target: mark.attrs.target, rel: mark.attrs.rel },
        0,
      ],
    },
  ],
})

const dom = DOMSerializer.fromSchema(schema)
const html = HTMLSerializer.fromSchema(schema)

/** What the DOM produces, which is the definition of correct here. */
const viaDOM = (doc: unknown) => {
  const container = document.createElement('div')
  dom.serializeFragment(schema.nodeFromJSON(doc).content, container)
  return container.innerHTML
}

const viaString = (doc: unknown) => html.serializeFragment(schema.nodeFromJSON(doc).content)

const agree = (doc: unknown) => {
  const expected = viaDOM(doc)
  expect(viaString(doc)).toBe(expected)
  return expected
}

const p = (...content: unknown[]) => ({ type: 'paragraph', content })
const t = (text: string, marks?: unknown[]) => ({
  type: 'text',
  text,
  ...(marks ? { marks } : {}),
})
const doc = (...content: unknown[]) => ({ type: 'doc', content })

describe('HTMLSerializer', () => {
  it('agrees with the DOM on an ordinary document', () => {
    expect(agree(doc(p(t('Hello.'))))).toBe('<p>Hello.</p>')
  })

  it('agrees on headings, rules, breaks and void elements', () => {
    agree(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [t('Title')] },
        { type: 'horizontalRule' },
        p(t('before'), { type: 'hardBreak' }, t('after')),
      ),
    )
  })

  it('agrees on nested blocks', () => {
    agree(doc({ type: 'blockquote', content: [p(t('quoted')), p(t('twice'))] }))
  })

  it('agrees when the content hole is inside a child, with a sibling after it', () => {
    const out = agree(doc({ type: 'figure', content: [p(t('inside'))] }))
    expect(out).toContain('<div class="inner"><p>inside</p></div>')
    expect(out).toContain('<span class="after"></span>')
  })

  it('keeps adjacent text under one mark element, as the DOM does', () => {
    const out = agree(doc(p(t('a', [{ type: 'bold' }]), t('b', [{ type: 'bold' }]))))
    expect(out).toBe('<p><strong>ab</strong></p>')
  })

  it('reopens a mark when the run is broken', () => {
    agree(doc(p(t('a', [{ type: 'bold' }]), t(' plain '), t('b', [{ type: 'bold' }]))))
  })

  it('agrees on a mark whose spec declares no hole', () => {
    expect(agree(doc(p(t('slanted', [{ type: 'italic' }]))))).toBe('<p><em>slanted</em></p>')
  })

  it('agrees on a mark with no toDOM at all', () => {
    expect(agree(doc(p(t('bare', [{ type: 'plain' }]))))).toBe('<p><span>bare</span></p>')
  })

  it('agrees on nested marks', () => {
    agree(doc(p(t('both', [{ type: 'bold' }, { type: 'italic' }]))))
  })

  it('escapes text the way the DOM does', () => {
    agree(doc(p(t('< > & " \'   ünïcode 😀'))))
  })

  it('escapes attribute values the way the DOM does', () => {
    agree(doc(p({ type: 'image', attrs: { src: 'a.png?x=1&y=2', alt: 'a "quoted" <tag>' } })))
  })

  describe('the security gate, repeated exactly', () => {
    it('drops a javascript: href', () => {
      const out = agree(
        doc(p(t('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))),
      )
      expect(out).not.toContain('javascript:')
    })

    it('drops a scheme smuggled past a filter with whitespace', () => {
      const out = agree(
        doc(p(t('click', [{ type: 'link', attrs: { href: 'java\tscript:alert(1)' } }]))),
      )
      expect(out.toLowerCase()).not.toContain('javascript:')
    })

    it('drops a protocol-relative href', () => {
      const out = agree(
        doc(p(t('click', [{ type: 'link', attrs: { href: '//evil.example' } }]))),
      )
      expect(out).not.toContain('//evil.example')
    })

    it('refuses a data: URL that is not an image', () => {
      const out = agree(
        doc(p({ type: 'image', attrs: { src: 'data:text/html;base64,PHNjcmlwdD4=' } })),
      )
      expect(out).not.toContain('data:text/html')
    })

    it('allows a genuine inline image', () => {
      const out = agree(
        doc(p({ type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgo=' } })),
      )
      expect(out).toContain('data:image/png')
    })

    it('adds noopener and noreferrer beside target=_blank', () => {
      const out = agree(
        doc(
          p(
            t('out', [
              { type: 'link', attrs: { href: 'https://x.example', target: '_blank' } },
            ]),
          ),
        ),
      )
      expect(out).toContain('noopener')
      expect(out).toContain('noreferrer')
    })

    it('rewrites an existing rel in place rather than appending a second one', () => {
      const out = agree(
        doc(
          p(
            t('out', [
              {
                type: 'link',
                attrs: { href: 'https://x.example', target: '_blank', rel: 'nofollow' },
              },
            ]),
          ),
        ),
      )
      expect(out).toContain('nofollow')
      expect(out.match(/rel=/g)).toHaveLength(1)
    })
  })

  describe('against the DOM, on generated documents', () => {
    const random = (seed: number) => {
      let state = seed
      return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff
        return state / 0x7fffffff
      }
    }

    const texts = ['plain', '< &', '"quoted"', ' nbsp', 'emoji 😀', '']
    const markSets = [
      undefined,
      [{ type: 'bold' }],
      [{ type: 'italic' }],
      [{ type: 'plain' }],
      [{ type: 'bold' }, { type: 'italic' }],
      [{ type: 'link', attrs: { href: 'https://x.example' } }],
      [{ type: 'link', attrs: { href: 'javascript:alert(1)', target: '_blank' } }],
    ]

    it('agrees on two hundred generated documents', () => {
      for (let seed = 1; seed <= 200; seed++) {
        const next = random(seed)
        const pick = <T>(list: T[]): T => list[Math.floor(next() * list.length)] as T

        const blocks = Array.from({ length: 1 + Math.floor(next() * 4) }, () => {
          const roll = next()
          const inline = Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
            next() < 0.15
              ? { type: 'image', attrs: { src: pick(['a.png', '//evil.example', 'b.png']) } }
              : next() < 0.15
                ? { type: 'hardBreak' }
                : t(pick(texts), pick(markSets)),
          ).filter((node) => !('text' in node && node.text === ''))

          if (inline.length === 0) inline.push(t('x'))
          if (roll < 0.15) return { type: 'horizontalRule' }
          if (roll < 0.3)
            return { type: 'heading', attrs: { level: 1 + (seed % 2) }, content: inline }
          if (roll < 0.4)
            return { type: 'blockquote', content: [{ type: 'paragraph', content: inline }] }
          if (roll < 0.5)
            return { type: 'figure', content: [{ type: 'paragraph', content: inline }] }
          return { type: 'paragraph', content: inline }
        })

        const document_ = { type: 'doc', content: blocks }
        expect(viaString(document_), `seed ${seed}`).toBe(viaDOM(document_))
      }
    })
  })

  it('serializeHTML matches the DOM serializer it replaces', () => {
    const document_ = doc(p(t('Hello '), t('world', [{ type: 'bold' }])))
    const fragment = schema.nodeFromJSON(document_).content as Fragment
    expect(html.serializeHTML(fragment)).toBe(dom.serializeHTML(fragment))
  })
})
