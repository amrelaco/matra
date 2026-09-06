import { describe, expect, it } from 'vitest'
import { starterKit } from './extensions/starter-kit'
import { createEditor } from './index'
import type { DocNode, ExtensionDef } from './types'

/**
 * The example on the "Refusing a change" docs page, run.
 *
 * It used to call `engine(ctx)`, which is not exported — the page taught a
 * pattern only the bundled extensions can use. This is the replacement,
 * copied verbatim from the page, so the page cannot drift back.
 */
describe('the filterChange example from the docs', () => {
  const textLength = (node: DocNode): number =>
    node.text?.length ?? (node.content ?? []).reduce((n, child) => n + textLength(child), 0)

  const limit: ExtensionDef = {
    kind: 'extension',
    name: 'limit',
    filterChange: (ctx) => textLength(ctx.doc) <= 280,
  }

  const mount = (content: string) => {
    const editor = createEditor({ extensions: [...starterKit, limit], content })
    editor.mount(document.createElement('div'))
    return editor
  }

  it('lets a change through while under the limit', () => {
    const editor = mount('<p>short</p>')
    expect(editor.commands.insert(' and a little more')).toBe(true)
    expect(editor.getHTML()).toContain('and a little more')
  })

  it('refuses the change that would cross it', () => {
    const editor = mount(`<p>${'x'.repeat(275)}</p>`)
    const before = editor.getHTML()
    editor.commands.insert('yyyyyyyyyy')
    expect(editor.getHTML()).toBe(before)
  })

  it('reads the document as it would be, not as it is', () => {
    // 280 exactly is allowed; the filter sees the proposed doc, so a change
    // landing on the boundary is not refused.
    const editor = mount(`<p>${'x'.repeat(279)}</p>`)
    expect(editor.commands.insert('x')).toBe(true)
    expect(textLength(editor.getJSON() as DocNode)).toBe(280)
  })
})
