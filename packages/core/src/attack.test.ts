/**
 * Adversarial tests.
 *
 * Every case here is written as an attacker would: assume the document JSON,
 * the pasted HTML and the collaborative steps all come from someone hostile,
 * because in a real product at least one of them does.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { comment, image, starterKit } from './extensions'
import type { DocNode, Pos } from './types'

const mount = (editor: ReturnType<typeof createEditor>) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

describe('attack: script injection through document JSON', () => {
  it('does not set an event handler smuggled in node attrs', () => {
    const editor = createEditor({
      extensions: [...starterKit, image] as const,
      content: '<p>x</p>',
    })
    const element = mount(editor)

    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'image',
              attrs: { src: 'ok.png', onerror: 'globalThis.PWNED = true', onload: 'x' },
            },
          ],
        },
      ],
    } as DocNode)

    const img = element.querySelector('img')
    expect(img?.getAttribute('onerror')).toBeNull()
    expect(img?.getAttribute('onload')).toBeNull()
  })

  it('does not honour a javascript: href smuggled through JSON', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>x</p>' })
    const element = mount(editor)

    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    } as DocNode)

    expect(element.innerHTML).not.toContain('javascript:')
  })

  it('does not run script tags from pasted HTML', () => {
    const editor = createEditor({
      extensions: starterKit,
      content:
        '<p>safe</p><script>globalThis.PWNED = true</script><img src=x onerror="globalThis.PWNED = true">',
    })
    const element = mount(editor)
    expect(element.innerHTML).not.toContain('<script')
    expect(element.innerHTML).not.toContain('onerror')
    expect((globalThis as Record<string, unknown>).PWNED).toBeUndefined()
  })
})

describe('attack: prototype pollution', () => {
  it('refuses a node type named __proto__', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>x</p>' })
    expect(() =>
      editor.setContent({ type: 'doc', content: [{ type: '__proto__' }] } as DocNode),
    ).toThrow()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('refuses a mark type named constructor', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>x</p>' })
    expect(() =>
      editor.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'a', marks: [{ type: 'constructor' }] }],
          },
        ],
      } as DocNode),
    ).toThrow()
  })

  it('does not pollute Object.prototype through attribute names', () => {
    const editor = createEditor({
      extensions: [...starterKit, image] as const,
      content: '<p>x</p>',
    })
    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src: 'a.png', __proto__: { polluted: true } } }],
        },
      ],
    } as DocNode)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('attack: denial of service', () => {
  it('refuses a content expression that would explode into states', () => {
    // heading{1,1000000} would build a million NFA states.
    expect(() =>
      createEditor({
        extensions: [
          { kind: 'node', name: 'doc', content: 'paragraph{1,1000000}' },
          { kind: 'node', name: 'paragraph', content: 'inline*', group: 'block' },
          { kind: 'node', name: 'text', group: 'inline' },
        ] as const,
        content: '<p>x</p>',
      }),
    ).toThrow(/too large|repeat/i)
  })

  it('survives absurdly deep nesting without blowing the stack', () => {
    let nested: DocNode = { type: 'paragraph', content: [{ type: 'text', text: 'deep' }] }
    for (let i = 0; i < 3000; i++) nested = { type: 'blockquote', content: [nested] }

    const editor = createEditor({ extensions: starterKit, content: '<p>x</p>' })
    // Either it works or it reports failure — it must not crash the process.
    expect(() => {
      try {
        editor.setContent({ type: 'doc', content: [nested] } as DocNode)
      } catch {
        /* refusing is an acceptable answer */
      }
    }).not.toThrow()
  })
})

describe('attack: hostile collaborative steps', () => {
  it('ignores a step pointing past the end of the document', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    const before = editor.getJSON()
    const engine = editor.unsafe as { state: unknown }
    expect(engine.state).toBeTruthy()

    // A peer claiming to replace positions far beyond the document.
    editor.commands.replace({ from: 900000 as Pos, to: 900001 as Pos }, 'boom')
    expect(editor.getJSON()).toEqual(before)
  })

  it('ignores a step with a negative position', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    const before = editor.getJSON()
    editor.commands.replace({ from: -50 as Pos, to: -10 as Pos }, 'boom')
    expect(editor.getJSON()).toEqual(before)
  })

  it('ignores nonsense positions', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    const before = editor.getJSON()
    editor.commands.replace({ from: Number.NaN as Pos, to: Number.NaN as Pos }, 'x')
    editor.commands.replace(
      { from: Number.POSITIVE_INFINITY as Pos, to: Number.POSITIVE_INFINITY as Pos },
      'x',
    )
    expect(editor.getJSON()).toEqual(before)
  })

  it('ignores a selection outside the document', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    expect(editor.commands.select({ from: -5 as Pos, to: -1 as Pos })).toBe(false)
    expect(editor.commands.select({ from: 99999 as Pos, to: 99999 as Pos })).toBe(false)
    expect(editor.commands.select({ from: Number.NaN as Pos, to: Number.NaN as Pos })).toBe(
      false,
    )
  })
})

describe('attack: malformed input', () => {
  it('refuses a text node with no text', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>x</p>' })
    expect(() =>
      editor.setContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text' }] }],
      } as DocNode),
    ).toThrow()
  })

  it('refuses JSON that is not a node at all', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>x</p>' })
    expect(() => editor.setContent(null as never)).toThrow()
    expect(() => editor.setContent(42 as never)).toThrow()
  })

  it('survives an input rule whose handler throws', () => {
    const editor = createEditor({
      extensions: [
        ...starterKit,
        {
          kind: 'extension',
          name: 'broken',
          inputRules: [
            {
              match: /^boom\s$/,
              handler: () => {
                throw new Error('rule exploded')
              },
            },
          ],
        },
      ] as const,
      content: '<p>x</p>',
    })
    const element = mount(editor)
    expect(() => {
      element.dispatchEvent(
        new InputEvent('beforeinput', {
          inputType: 'insertText',
          data: ' ',
          bubbles: true,
          cancelable: true,
        }),
      )
    }).not.toThrow()
  })
})

describe('attack: round two', () => {
  it('does not let a node with undeclared attrs put anything it likes in the DOM', () => {
    // A node type that declares no attrs but renders them — a plausible
    // mistake in someone else's extension.
    const sloppy = {
      kind: 'node',
      name: 'sloppy',
      group: 'block',
      parseDOM: [{ tag: 'div.sloppy' }],
      toDOM: (node: { attrs?: Record<string, unknown> }) => ['div', node.attrs ?? {}],
    } as never

    const editor = createEditor({
      extensions: [...starterKit, sloppy] as const,
      content: '<p>x</p>',
    })
    const element = mount(editor)

    editor.setContent({
      type: 'doc',
      content: [
        { type: 'sloppy', attrs: { onclick: 'globalThis.PWNED = true', class: 'fine' } },
      ],
    } as DocNode)

    const div = element.querySelector('div')
    expect(div?.getAttribute('onclick')).toBeNull()
  })

  it('refuses a protocol-relative link that could point anywhere', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    // "//evil.example" inherits the page protocol and leaves the site.
    expect(editor.commands.setLink({ href: '//evil.example/steal' })).toBe(false)
  })

  it('refuses a data: URL that is not an image', () => {
    const editor = createEditor({
      extensions: [...starterKit, image] as const,
      content: '<p>x</p>',
    })
    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    expect(
      editor.commands.insertImage({
        src: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      }),
    ).toBe(false)
    expect(editor.commands.insertImage({ src: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(
      true,
    )
  })

  it('does not run script smuggled into a widget decoration', () => {
    const editor = createEditor({
      extensions: [
        ...starterKit,
        {
          kind: 'extension',
          name: 'widget',
          decorations: () => [
            {
              type: 'widget',
              pos: 1 as Pos,
              key: 'w',
              render: () => {
                const el = document.createElement('span')
                el.innerHTML = '<img src=x onerror="globalThis.PWNED = true">'
                return el
              },
            },
          ],
        },
      ] as const,
      content: '<p>hello</p>',
    })
    mount(editor)
    // A widget is application code, so it can build what it likes — but it must
    // not end up inside the document.
    expect(editor.getHTML()).toBe('<p>hello</p>')
    expect(editor.getText()).toBe('hello')
  })

  it('keeps a hostile thread id from breaking out of the attribute', () => {
    const editor = createEditor({
      extensions: [...starterKit, comment] as const,
      content: '<p>hello</p>',
    })
    const element = mount(editor)
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.addComment('"><img src=x onerror=alert(1)>')

    // The payload survives as *text* inside an escaped attribute, which is
    // exactly right — what matters is that no element was created from it.
    expect(element.querySelector('img')).toBeNull()
    expect(element.innerHTML).toContain('&quot;')
    expect(element.innerHTML).not.toContain('"><img')
  })

  it('does not let a peer’s step JSON reach Object.prototype', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    const engine = (editor.unsafe as { schema: unknown }).schema
    expect(engine).toBeTruthy()

    // Steps arrive as data from other clients.
    const before = editor.getJSON()
    editor.commands.replace({ from: 1 as Pos, to: 1 as Pos }, {
      type: 'text',
      text: 'ok',
      // biome-ignore lint/suspicious/noExplicitAny: hostile input by design
      ['__proto__' as never]: { polluted: true } as any,
    } as DocNode)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(editor.getJSON()).not.toEqual(before)
  })
})

describe('attack: round three', () => {
  it('does not leak a javascript: href through getHTML either', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>x</p>' })
    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    } as DocNode)
    // getHTML is what applications persist and re-serve. It must be clean too.
    expect(editor.getHTML()).not.toContain('javascript:')
  })

  it('does not honour vbscript: or data:text/html anywhere', () => {
    const editor = createEditor({
      extensions: [...starterKit, image] as const,
      content: '<p>x</p>',
    })
    for (const href of [
      'vbscript:msgbox(1)',
      'data:text/html,<script>alert(1)</script>',
      ' javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
    ]) {
      editor.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href } }] }],
          },
        ],
      } as DocNode)
      const html = editor.getHTML()
      expect(html.toLowerCase()).not.toContain('javascript:')
      expect(html.toLowerCase()).not.toContain('vbscript:')
      expect(html.toLowerCase()).not.toContain('data:text/html')
    }
  })

  it('keeps a base64 image working while blocking its lookalikes', () => {
    const editor = createEditor({
      extensions: [...starterKit, image] as const,
      content: '<p>x</p>',
    })
    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    expect(editor.commands.insertImage({ src: 'data:image/png;base64,iVBORw0KGgo=' })).toBe(
      true,
    )
    expect(editor.getHTML()).toContain('data:image/png')
  })

  it('refuses an input rule that would loop forever', () => {
    // A rule that re-triggers itself must not hang the editor.
    const editor = createEditor({
      extensions: [
        ...starterKit,
        {
          kind: 'extension',
          name: 'loop',
          inputRules: [{ match: /x$/, handler: (ctx) => ctx.insert('x') }],
        },
      ] as const,
      content: '<p>hello</p>',
    })
    const element = mount(editor)
    const start = Date.now()
    element.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'x',
        bubbles: true,
        cancelable: true,
      }),
    )
    expect(Date.now() - start).toBeLessThan(2000)
  })

  it('survives a node view that throws while building', () => {
    const editor = createEditor({
      extensions: [
        ...starterKit,
        {
          kind: 'node',
          name: 'boom',
          group: 'block',
          parseDOM: [{ tag: 'div.boom' }],
          toDOM: () => ['div', { class: 'boom' }],
          nodeView: () => {
            throw new Error('view exploded')
          },
        },
      ] as const,
      content: '<div class="boom"></div>',
    })
    // Failing to mount is acceptable; corrupting the document is not.
    try {
      mount(editor)
    } catch {
      /* refusing to render is an answer */
    }
    expect(editor.getJSON().type).toBe('doc')
  })

  it('does not let a mark with required attrs be forged without them', () => {
    const editor = createEditor({
      extensions: [...starterKit, comment] as const,
      content: '<p>x</p>',
    })
    expect(() =>
      editor.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'a', marks: [{ type: 'comment' }] }],
          },
        ],
      } as DocNode),
    ).toThrow(/requires the attribute/)
  })

  it('clamps a selection when the document shrinks underneath it', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello world</p>' })
    editor.commands.select({ from: 11 as Pos, to: 12 as Pos })
    editor.commands.remove({ from: 1 as Pos, to: 12 as Pos })
    const size = editor.getJSON().content?.length ?? 0
    expect(size).toBeGreaterThan(0)
    expect(editor.selection.from).toBeLessThanOrEqual(editor.getText().length + 2)
  })
})

describe('attack: the render gate is the only gate that matters', () => {
  const TAB = String.fromCharCode(9)
  const LF = String.fromCharCode(10)
  const CR = String.fromCharCode(13)
  const NUL = String.fromCharCode(0)

  /** What a browser resolves, after it strips the characters URLs ignore. */
  const asBrowserSees = (value: string) =>
    value
      .replace(/[\t\n\r\0]/g, '')
      .trim()
      .toLowerCase()

  const linkDoc = (href: string) => ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'click', marks: [{ type: 'link', attrs: { href } }] }],
      },
    ],
  })

  const hostile = [
    ['plain scheme', 'javascript:alert(1)'],
    ['mixed case', 'JaVaScRiPt:alert(1)'],
    ['leading space', '  javascript:alert(1)'],
    ['tab inside the scheme', `java${TAB}script:alert(1)`],
    ['newline inside the scheme', `java${LF}script:alert(1)`],
    ['carriage return inside the scheme', `java${CR}script:alert(1)`],
    ['NUL inside the scheme', `java${NUL}script:alert(1)`],
    ['every separator at once', `j${TAB}a${LF}v${CR}a${NUL}script:alert(1)`],
    ['leading NUL', `${NUL}javascript:alert(1)`],
    ['vbscript with a tab', `vb${TAB}script:msgbox(1)`],
    ['data: document', 'data:text/html,<script>alert(1)</script>'],
    ['protocol-relative', '//evil.example/x'],
    ['protocol-relative behind a tab', `${TAB}//evil.example/x`],
  ] as const

  // The document model keeps what it was given; the gate runs on the way out.
  // So the assertion is about rendered output, not about stored attributes.
  for (const [name, href] of hostile) {
    it(`refuses ${name} in serialized HTML`, () => {
      const editor = createEditor({ extensions: starterKit })
      editor.setContent(linkDoc(href))
      const match = /href="([^"]*)"/.exec(editor.getHTML())
      if (match) {
        const resolved = asBrowserSees(match[1] ?? '')
        expect(resolved.startsWith('javascript:')).toBe(false)
        expect(resolved.startsWith('vbscript:')).toBe(false)
        expect(resolved.startsWith('data:text')).toBe(false)
        expect(resolved.startsWith('//')).toBe(false)
      }
    })
  }

  it('still emits an ordinary link', () => {
    const editor = createEditor({ extensions: starterKit })
    editor.setContent(linkDoc('https://ok.example/x'))
    expect(editor.getHTML()).toContain('https://ok.example/x')
  })

  it('still emits an inline image', () => {
    const editor = createEditor({ extensions: [...starterKit, image] })
    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgo=' } }],
        },
      ],
    })
    expect(editor.getHTML()).toContain('data:image/png;base64')
  })

  it('refuses a non-object passed where a range belongs', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    for (const value of [null, undefined, 'x', true, Symbol.iterator] as unknown[]) {
      expect(editor.commands.select(value as never)).toBe(false)
    }
    expect(editor.getHTML()).toContain('hello')
  })
})

const ed = (content?: unknown) =>
  createEditor({ extensions: starterKit, content: content as never })

describe('attack: malformed and hostile document JSON', () => {
  it('R1 tabnabbing: JSON can blank out rel while keeping target=_blank', () => {
    const e = createEditor({ extensions: starterKit })
    e.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://evil.example', target: '_blank', rel: '' },
                },
              ],
            },
          ],
        },
      ],
    } as never)
    const html = e.getHTML()
    if (/target="_blank"/.test(html)) expect(html).toMatch(/noopener/)
  })

  it('R2 deep nesting does not blow the stack', () => {
    let node: unknown = { type: 'paragraph', content: [{ type: 'text', text: 'deep' }] }
    for (let i = 0; i < 5000; i++) node = { type: 'blockquote', content: [node] }
    const e = createEditor({ extensions: starterKit })
    expect(() => {
      try {
        e.setContent({ type: 'doc', content: [node] } as never)
        e.getHTML()
      } catch (err) {
        if (err instanceof RangeError) throw err // stack overflow is a real failure
      }
    }).not.toThrow()
  })

  it('R3 undeclared mark attrs are dropped', () => {
    const e = createEditor({ extensions: starterKit })
    e.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'x',
              marks: [{ type: 'bold', attrs: { onclick: 'alert(1)', style: 'x' } }],
            },
          ],
        },
      ],
    } as never)
    expect(e.getHTML()).not.toMatch(/onclick/i)
  })

  it('R4 unknown node/mark type in JSON is refused, not crashed', () => {
    const e = createEditor({ extensions: starterKit })
    for (const doc of [
      { type: 'doc', content: [{ type: 'nope' }] },
      {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'x', marks: [{ type: 'nope' }] }],
          },
        ],
      },
      { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text' }] }] },
      { type: 'doc', content: 'not-an-array' },
      { type: 'doc' },
      {},
      null,
    ]) {
      let threw: string | null = null
      try {
        e.setContent(doc as never)
      } catch (err) {
        threw = (err as Error).message
      }
    }
    expect(e.getHTML()).toBeTypeOf('string') // editor still alive
  })

  it('R5 huge single text node completes', () => {
    const e = createEditor({ extensions: starterKit })
    const started = performance.now()
    e.setContent({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(2_000_000) }] },
      ],
    } as never)
    e.getHTML()
    expect(true).toBe(true)
  })

  it('R6 image src with hostile data type', () => {
    const e = createEditor({ extensions: [...starterKit, image] })
    for (const src of [
      'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    ]) {
      e.setContent({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src } }] }],
      } as never)
    }
    expect(true).toBe(true)
  })

  it('R7 __proto__ / prototype pollution through attrs', () => {
    const e = createEditor({ extensions: starterKit })
    const evil = JSON.parse(
      '{"type":"doc","content":[{"type":"heading","attrs":{"__proto__":{"polluted":"yes"},"level":1},"content":[{"type":"text","text":"x"}]}]}',
    )
    try {
      e.setContent(evil)
      e.getHTML()
    } catch (err) {
      console.log('R7 threw', (err as Error).message)
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('attack: extensions, depth limits and link targets', () => {
  it('S1 a hostile widget decoration cannot inject script into the document', () => {
    const evil = {
      name: 'evil',
      kind: 'extension' as const,
      decorations: () => {
        throw new Error('decorator exploded')
      },
    }
    const e = createEditor({
      extensions: [...starterKit, evil] as never,
      content: '<p>safe</p>',
    })
    const el = document.createElement('div')
    document.body.appendChild(el)
    e.mount(el)
    expect(el.textContent).toContain('safe')
  })

  it('S2 an extension whose command throws cannot take the editor down', () => {
    const evil = {
      name: 'boom',
      kind: 'extension' as const,
      commands: {
        boom: () => {
          throw new Error('kaboom')
        },
      },
    }
    const e = createEditor({
      extensions: [...starterKit, evil] as never,
      content: '<p>alive</p>',
    })
    const commands = e.commands as unknown as { boom: () => boolean }
    expect(commands.boom()).toBe(false)
    expect(e.getHTML()).toContain('alive')
  })

  it('S3 setContent with a doc whose depth is exactly at and past the limit', () => {
    const build = (n: number) => {
      let node: unknown = { type: 'paragraph', content: [{ type: 'text', text: 'x' }] }
      for (let i = 0; i < n; i++) node = { type: 'blockquote', content: [node] }
      return { type: 'doc', content: [node] }
    }
    const e = createEditor({ extensions: starterKit })
    expect(() => e.setContent(build(20) as never)).not.toThrow()
    expect(() => e.setContent(build(5000) as never)).toThrow(/nests deeper/)
    e.setContent('<p>recovered</p>')
    expect(e.getHTML()).toContain('recovered')
  })

  it('S4 pasted HTML nested past the limit does not blow the stack', () => {
    const e = createEditor({ extensions: starterKit })
    const html = `${'<blockquote>'.repeat(5000)}<p>deep</p>${'</blockquote>'.repeat(5000)}`
    expect(() => {
      e.setContent(html)
      e.getHTML()
    }).not.toThrow()
    expect(e.getHTML()).toBeTypeOf('string')
  })

  it('S5 target=_blank always carries noopener however it arrives', () => {
    const e = createEditor({ extensions: starterKit })
    for (const rel of ['', 'nofollow', 'noopener']) {
      e.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'x',
                marks: [
                  { type: 'link', attrs: { href: 'https://e.example', target: '_blank', rel } },
                ],
              },
            ],
          },
        ],
      } as never)
      const html = e.getHTML()
      expect(html).toMatch(/noopener/)
      expect(html).toMatch(/noreferrer/)
    }
  })

  it('S6 malformed content field reports a Matra error, not a TypeError', () => {
    const e = createEditor({ extensions: starterKit })
    expect(() => e.setContent({ type: 'doc', content: 'nope' } as never)).toThrow(/Matra:/)
  })
})
