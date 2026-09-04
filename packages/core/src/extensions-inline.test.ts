/**
 * Four small extensions: a `kbd` mark, hashtags as nodes, snippets that expand
 * as they are typed, and an allowlisted embed frame.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { parseBinding } from './engine/keys'
import { starterKit } from './extensions'
import { embed } from './extensions/embed'
import { hashtag, hashtagsIn } from './extensions/hashtag'
import { kbd } from './extensions/kbd'
import { snippets } from './extensions/snippets'
import type { DocNode, Pos } from './types'

const mount = (editor: { mount(el: HTMLElement): void }) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

/** Put the DOM caret at the end of the last text node inside `selector`. */
const caretAtEndOf = (element: HTMLElement, selector: string) => {
  const blocks = element.querySelectorAll(selector)
  const block = blocks[blocks.length - 1] as HTMLElement
  let last: globalThis.Node = block
  while (last.lastChild) last = last.lastChild
  const range = document.createRange()
  const offset = last.nodeType === 3 ? (last.nodeValue ?? '').length : last.childNodes.length
  range.setStart(last, offset)
  range.collapse(true)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const fireInput = (element: HTMLElement, inputType: string, data: string | null = null) => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'inputType', { value: inputType })
  Object.defineProperty(event, 'data', { value: data })
  Object.defineProperty(event, 'target', { value: element })
  element.dispatchEvent(event)
}

/** Type through the view, so input rules fire the way they do for a person. */
const typeInto = (element: HTMLElement, selector: string, text: string) => {
  for (const character of text) {
    caretAtEndOf(element, selector)
    fireInput(element, 'insertText', character)
  }
}

const press = (element: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  element.dispatchEvent(event)
  return event.defaultPrevented
}

/** Whichever key `Mod` resolves to here — Cmd on Apple, Ctrl elsewhere. */
const MOD = parseBinding('Mod-a')

describe('kbd', () => {
  const build = (content = '<p>press Ctrl to go</p>') =>
    createEditor({ extensions: [...starterKit, kbd] as const, content })

  it('toggles on a selection and reports itself active', () => {
    const editor = build()
    editor.commands.select({ from: 7 as Pos, to: 11 as Pos })
    expect(editor.isActive('kbd')).toBe(false)
    expect(editor.commands.toggleKbd()).toBe(true)
    expect(editor.getHTML()).toBe('<p>press <kbd>Ctrl</kbd> to go</p>')
    expect(editor.isActive('kbd')).toBe(true)
    expect(editor.commands.toggleKbd()).toBe(true)
    expect(editor.getHTML()).toBe('<p>press Ctrl to go</p>')
    expect(editor.isActive('kbd')).toBe(false)
  })

  it('reads a <kbd> back and writes it out unchanged', () => {
    const editor = build('<p>press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy</p>')
    expect(editor.getJSON().content?.[0]?.content?.[1]).toEqual({
      type: 'text',
      text: 'Ctrl',
      marks: [{ type: 'kbd' }],
    })
    expect(editor.getHTML()).toBe('<p>press <kbd>Ctrl</kbd>+<kbd>C</kbd> to copy</p>')
  })

  it('answers Mod-Alt-k', () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.select({ from: 7 as Pos, to: 11 as Pos })
    expect(press(element, 'k', { altKey: true, metaKey: MOD.meta, ctrlKey: MOD.ctrl })).toBe(
      true,
    )
    expect(editor.getHTML()).toBe('<p>press <kbd>Ctrl</kbd> to go</p>')
  })

  it('swaps with code rather than sitting inside it', () => {
    const editor = build('<p>press <code>Ctrl</code> to go</p>')
    editor.commands.select({ from: 7 as Pos, to: 11 as Pos })
    expect(editor.commands.toggleKbd()).toBe(true)
    expect(editor.getHTML()).toBe('<p>press <kbd>Ctrl</kbd> to go</p>')
    expect(editor.commands.toggleCode()).toBe(true)
    expect(editor.getHTML()).toBe('<p>press <code>Ctrl</code> to go</p>')
  })
})

describe('hashtag', () => {
  const build = (content = '<p></p>', options?: Parameters<typeof hashtag>[0]) =>
    createEditor({ extensions: [...starterKit, hashtag(options)] as const, content })

  it('turns #word and a space into a node, with the space after it', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'see #matra now')
    expect(editor.getJSON().content?.[0]?.content).toEqual([
      { type: 'text', text: 'see ' },
      { type: 'hashtag', attrs: { tag: 'matra' } },
      { type: 'text', text: ' now' },
    ])
    expect(editor.getHTML()).toBe(
      '<p>see <span data-hashtag="matra" class="matra-hashtag">#matra</span> now</p>',
    )
  })

  it('fires at the start of a block and not inside a word', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', '#first a#b ')
    expect(editor.getJSON().content?.[0]?.content).toEqual([
      { type: 'hashtag', attrs: { tag: 'first' } },
      { type: 'text', text: ' a#b ' },
    ])
  })

  it('refuses a tag the pattern does not allow', () => {
    const editor = build()
    expect(editor.commands.insertHashtag('bad tag')).toBe(false)
    expect(editor.commands.insertHashtag('')).toBe(false)
    expect(editor.commands.insertHashtag('#x')).toBe(false)
    expect(editor.commands.insertHashtag('x'.repeat(65))).toBe(false)
    expect(editor.getHTML()).toBe('<p></p>')
    expect(editor.commands.insertHashtag('বাংলা_2-ok')).toBe(true)
    expect(editor.getHTML()).toContain('data-hashtag="বাংলা_2-ok"')
  })

  it('reads its own HTML back, dropping a tag that fails the pattern', () => {
    const editor = build(
      '<p><span data-hashtag="one">#one</span> and <span data-hashtag="bad tag">#bad</span></p>',
    )
    const nodes = editor.getJSON().content?.[0]?.content ?? []
    expect(nodes.filter((node) => node.type === 'hashtag')).toEqual([
      { type: 'hashtag', attrs: { tag: 'one' } },
    ])
    expect(editor.getHTML()).toContain(
      '<span data-hashtag="one" class="matra-hashtag">#one</span> and ',
    )
  })

  it('renders and names itself the way it is told', () => {
    const editor = build('<p></p>', { name: 'topic', render: (tag) => `⌗${tag}` })
    expect(editor.commands.insertHashtag('go')).toBe(true)
    expect(editor.getHTML()).toBe('<p><span data-topic="go" class="matra-topic">⌗go</span></p>')
    expect(hashtagsIn(editor.getJSON(), 'topic')).toEqual(['go'])
  })

  it('lists every tag in a document once, in order', () => {
    const doc: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'hashtag', attrs: { tag: 'two' } },
            { type: 'text', text: ' ' },
            { type: 'hashtag', attrs: { tag: 'one' } },
          ],
        },
        {
          type: 'blockquote',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'hashtag', attrs: { tag: 'two' } },
                { type: 'hashtag', attrs: { tag: 'three' } },
              ],
            },
          ],
        },
      ],
    }
    expect(hashtagsIn(doc)).toEqual(['two', 'one', 'three'])
    expect(hashtagsIn({ type: 'doc' })).toEqual([])
  })
})

describe('snippets', () => {
  const list = [
    { trigger: 'sig', content: '— Nahim' },
    { trigger: 'hr', content: { type: 'horizontalRule' } },
    {
      trigger: 'hi',
      content: [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'there', marks: [{ type: 'bold' }] },
      ],
    },
    { trigger: 'c++', content: 'C plus plus' },
  ]
  const build = (content = '<p></p>', options?: { prefix?: string }) =>
    createEditor({ extensions: [...starterKit, snippets(list, options)] as const, content })

  it('expands text and keeps the space that was typed', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'bye sig now')
    expect(editor.getText()).toBe('bye — Nahim now')
  })

  it('expands a block by splitting the paragraph, with no space', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'a hr ')
    expect(editor.getHTML()).toBe('<p>a </p><hr><p></p>')
  })

  it('expands inline nodes without adding the space', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'hi ')
    expect(editor.getHTML()).toBe('<p>Hello <strong>there</strong></p>')
  })

  it('leaves an unknown word and a word inside another alone', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'nope design ')
    expect(editor.getText()).toBe('nope design ')
    expect(editor.commands.insertSnippet('nope')).toBe(false)
  })

  it('escapes the trigger for the pattern', () => {
    const editor = build()
    const element = mount(editor)
    typeInto(element, 'p', 'c++ ')
    expect(editor.getText()).toBe('C plus plus ')
  })

  it('waits for the prefix when one is set', () => {
    const editor = build('<p></p>', { prefix: ';' })
    const element = mount(editor)
    typeInto(element, 'p', 'sig ;sig ')
    expect(editor.getText()).toBe('sig — Nahim ')
  })

  it('inserts a named snippet at the caret', () => {
    const editor = build('<p>ab</p>')
    editor.commands.select(2 as Pos)
    expect(editor.commands.insertSnippet('sig')).toBe(true)
    expect(editor.getText()).toBe('a— Nahimb')
    expect(editor.commands.insertSnippet('hr')).toBe(true)
    expect(editor.getHTML()).toBe('<p>a— Nahim</p><hr><p>b</p>')
  })

  it('refuses rather than throws when the content names a node the editor lacks', () => {
    const editor = createEditor({
      extensions: [...starterKit, snippets([{ trigger: 'x', content: { type: 'nope' } }])],
      content: '<p></p>',
    })
    expect(editor.commands.insertSnippet('x')).toBe(false)
    const element = mount(editor)
    expect(() => typeInto(element, 'p', 'x ')).not.toThrow()
    expect(editor.getText()).toBe('x ')
  })

  it('throws at construction for a trigger that could never fire', () => {
    expect(() => snippets([{ trigger: '', content: 'x' }])).toThrow()
    expect(() => snippets([{ trigger: 'two words', content: 'x' }])).toThrow()
    expect(() =>
      snippets([
        { trigger: 'a', content: 'x' },
        { trigger: 'a', content: 'y' },
      ]),
    ).toThrow()
    expect(() => snippets([{ trigger: 'a', content: '' }])).toThrow()
    expect(() => snippets([{ trigger: 'a', content: [] }])).toThrow()
    expect(() => snippets([{ trigger: 'a', content: 'x' }], { prefix: '; ' })).toThrow()
  })
})

describe('embed', () => {
  const build = (content = '<p>x</p>', options?: Parameters<typeof embed>[0]) =>
    createEditor({ extensions: [...starterKit, embed(options)] as const, content })

  it('frames an allowed address, sandboxed', () => {
    const editor = build()
    expect(editor.commands.insertEmbed('https://player.vimeo.com/video/1')).toBe(true)
    expect(editor.getHTML()).toBe(
      '<p>x</p>' +
        '<div class="matra-embed" data-embed="https://player.vimeo.com/video/1" style="aspect-ratio: 16/9" contenteditable="false">' +
        '<iframe src="https://player.vimeo.com/video/1" loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe>' +
        '</div>',
    )
  })

  it('refuses a host off the list, a plain http address and a script', () => {
    const editor = build()
    expect(editor.commands.insertEmbed('https://evil.example/x')).toBe(false)
    expect(editor.commands.insertEmbed('http://player.vimeo.com/video/1')).toBe(false)
    expect(editor.commands.insertEmbed('javascript:alert(1)')).toBe(false)
    expect(editor.commands.insertEmbed('//player.vimeo.com/video/1')).toBe(false)
    expect(editor.commands.insertEmbed('')).toBe(false)
    expect(editor.getHTML()).toBe('<p>x</p>')
  })

  it('lets Google through for Maps alone', () => {
    const editor = build()
    expect(editor.commands.insertEmbed('https://www.google.com/search?q=x')).toBe(false)
    expect(editor.commands.insertEmbed('https://www.google.com/maps/embed?pb=1')).toBe(true)
  })

  it('drops a frame pointing anywhere else on parse', () => {
    const editor = build(
      '<iframe src="https://evil.example/x"></iframe>' +
        '<iframe src="https://codepen.io/a/embed/b" title="Pen"></iframe>' +
        '<div data-embed="https://evil.example/y"><iframe src="https://evil.example/y"></iframe></div>',
    )
    expect(editor.getJSON().content?.filter((node) => node.type === 'embed')).toEqual([
      {
        type: 'embed',
        attrs: { src: 'https://codepen.io/a/embed/b', title: 'Pen', aspect: '16/9' },
      },
    ])
  })

  it('reads its own wrapper back, aspect and title included', () => {
    const editor = build(
      '<div data-embed="https://www.figma.com/embed?x=1" style="aspect-ratio: 4/3">' +
        '<iframe src="https://www.figma.com/embed?x=1" title="Design"></iframe></div>',
    )
    expect(editor.getJSON().content?.[0]).toEqual({
      type: 'embed',
      attrs: { src: 'https://www.figma.com/embed?x=1', title: 'Design', aspect: '4/3' },
    })
    expect(editor.getHTML()).toContain('style="aspect-ratio: 4/3"')
    expect(editor.getHTML()).toContain('title="Design"')
  })

  it('honours an allow function, a hostname and a pattern', () => {
    const custom = build('<p>x</p>', { allow: (src) => src.startsWith('https://my.example/') })
    expect(custom.commands.insertEmbed('https://my.example/e')).toBe(true)
    expect(custom.commands.insertEmbed('https://player.vimeo.com/video/1')).toBe(false)
    expect(custom.commands.insertEmbed('http://my.example/e')).toBe(false)

    const listed = build('<p>x</p>', { allow: ['a.example', /^https:\/\/b\.example\/ok\//g] })
    expect(listed.commands.insertEmbed('https://a.example/anything')).toBe(true)
    expect(listed.commands.insertEmbed('https://sub.a.example/')).toBe(false)
    expect(listed.commands.insertEmbed('https://b.example/ok/1')).toBe(true)
    expect(listed.commands.insertEmbed('https://b.example/ok/2')).toBe(true)
    expect(listed.commands.insertEmbed('https://b.example/no')).toBe(false)
  })

  it('round-trips through JSON and withholds the frame when the JSON lies', () => {
    const editor = build()
    const doc: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'embed',
          attrs: { src: 'https://www.loom.com/embed/abc', title: 'Demo', aspect: '1/1' },
        },
        { type: 'embed', attrs: { src: 'https://evil.example/', title: null, aspect: '16/9' } },
      ],
    }
    editor.setContent(doc)
    expect(editor.getJSON()).toEqual(doc)
    const html = editor.getHTML()
    expect(html).toContain('<iframe src="https://www.loom.com/embed/abc" title="Demo"')
    expect(html).toContain(
      '<div class="matra-embed" data-embed="https://evil.example/" style="aspect-ratio: 16/9" contenteditable="false"></div>',
    )
    expect(html.match(/<iframe /g)).toHaveLength(1)
  })

  it('changes the aspect of a given node and validates it', () => {
    const editor = build()
    expect(
      editor.commands.insertEmbed('https://stackblitz.com/edit/x', { aspect: 'wide' }),
    ).toBe(false)
    expect(
      editor.commands.insertEmbed('https://stackblitz.com/edit/x', { aspect: '4/3' }),
    ).toBe(true)
    expect(editor.getHTML()).toContain('style="aspect-ratio: 4/3"')
    expect(editor.commands.setEmbedAspect('21/9', 3 as Pos)).toBe(true)
    expect(editor.getHTML()).toContain('style="aspect-ratio: 21/9"')
    expect(editor.commands.setEmbedAspect('a/b', 3 as Pos)).toBe(false)
    expect(editor.commands.setEmbedAspect('1/1', 0 as Pos)).toBe(false)
    // A caret in a paragraph is not on an embed.
    editor.commands.select(1 as Pos)
    expect(editor.commands.setEmbedAspect('1/1')).toBe(false)
  })
})
