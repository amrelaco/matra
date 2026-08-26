import {
  createEditor,
  document as doc,
  heading,
  listItem,
  paragraph,
  text,
} from '@matrajs/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { regions } from './editable'

/**
 * What the page is not allowed to turn into an editor.
 *
 * The demos mount their own editors, and their content is ordinary `h1`, `p`
 * and `li` markup. This sweep looks for exactly that markup, so for a while it
 * found the inside of a mounted editor and mounted a second one over the top —
 * which tore out the node views on the way past, and is how the task list on
 * the landing page lost its checkboxes. Nothing threw; the page just rendered
 * a checklist with no boxes.
 */
describe('choosing what to make editable', () => {
  beforeEach(() => {
    globalThis.document.body.replaceChildren()
  })

  const html = (markup: string) => {
    globalThis.document.body.innerHTML = markup
  }

  it('takes ordinary prose', () => {
    html('<main><h2>Title</h2><p>Some words.</p></main>')
    const found = regions().map((element) => element.tagName)
    expect(found).toContain('H2')
    expect(found).toContain('P')
  })

  it('leaves the inside of a mounted editor alone', () => {
    const host = globalThis.document.createElement('div')
    globalThis.document.body.appendChild(host)
    const editor = createEditor({
      extensions: [doc, paragraph, text, heading, listItem] as never,
      content: '<h1>A block editor</h1><p>Words.</p>',
    })
    editor.mount(host)

    // The editor's own markup is exactly what the sweep looks for.
    expect(host.querySelectorAll('h1, p').length).toBeGreaterThan(0)
    for (const element of regions()) {
      expect(host.contains(element)).toBe(false)
    }
  })

  it('leaves navigation, code and buttons alone', () => {
    html(
      '<nav><p>Docs</p></nav>' +
        '<pre><code><p>sample</p></code></pre>' +
        '<p><a href="/docs">A link, and nothing else</a></p>' +
        '<p>Real prose.</p>',
    )
    const found = regions()
    expect(found.length).toBe(1)
    expect(found[0]?.textContent).toBe('Real prose.')
  })

  it('does not return a region twice', () => {
    html('<p>One</p><p>Two</p>')
    const found = regions()
    expect(new Set(found).size).toBe(found.length)
  })
})
