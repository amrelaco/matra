/**
 * The editor, with no browser anywhere.
 *
 * Every other test in this package runs in happy-dom, which means none of them
 * can tell the difference between code that does not need a DOM and code that
 * happens to find one. That difference is the whole claim behind rendering a
 * stored document on a server, in a worker, or at the edge — so this file runs
 * in bare Node and asserts the globals are genuinely absent before it starts.
 *
 * What is deliberately *not* here: parsing an HTML string. Reading HTML is a
 * DOM job and `content: '<p>…</p>'` is documented as needing one. Server code
 * loads JSON or Markdown, and both of those are checked below.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { fromMarkdown, starterKit, toMarkdown } from './extensions'

const MARKDOWN =
  '# Title\n\nA **bold** word and a [link](https://example.com).\n\n- one\n- two\n'

const load = () => createEditor({ extensions: starterKit, content: fromMarkdown(MARKDOWN) })

describe('with no DOM at all', () => {
  it('really has no DOM, or the rest of this file proves nothing', () => {
    for (const global of ['document', 'window', 'Element', 'HTMLElement', 'DocumentFragment']) {
      expect(global in globalThis, `${global} leaked into the server environment`).toBe(false)
    }
  })

  it('reads Markdown into a document', () => {
    const doc = fromMarkdown(MARKDOWN)
    expect(doc.type).toBe('doc')
    expect(doc.content?.length).toBeGreaterThan(1)
  })

  it('writes Markdown back, and the round trip is stable', () => {
    const once = toMarkdown(fromMarkdown(MARKDOWN))
    const twice = toMarkdown(fromMarkdown(once))
    expect(twice).toBe(once)
    expect(once).toContain('# Title')
  })

  it('creates an editor from JSON and reads it back', () => {
    const editor = load()
    expect(editor.getJSON().type).toBe('doc')
    expect(editor.getText()).toContain('Title')
  })

  it('renders HTML', () => {
    expect(load().getHTML()).toContain('<h1>Title</h1>')
  })

  it('applies the security gate while rendering', () => {
    const editor = createEditor({
      extensions: starterKit,
      content: {
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
      },
    })
    expect(editor.getHTML()).not.toContain('javascript:')
  })

  it('runs commands before anything is on screen', () => {
    const editor = load()
    expect(editor.commands.toggleBold()).toBe(true)
    expect(editor.getJSON().type).toBe('doc')
  })

  it('reports what a command would do, without a view to do it in', () => {
    expect(typeof load().can.toggleBold()).toBe('boolean')
  })

  it('destroys cleanly when it was never mounted', () => {
    expect(() => load().destroy()).not.toThrow()
  })
})
