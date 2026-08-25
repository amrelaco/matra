/**
 * HTML as it is actually written, rather than as a schema would like it.
 *
 * A `<li>` almost never contains a `<p>`. Neither does a `<blockquote>` on most
 * of the web, or a table cell. The schema requires blocks in all three, so the
 * parser has to give loose inline content a block to live in — and when it did
 * that only at the document level, every list pasted from anywhere arrived
 * empty.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit, tableKit } from './extensions'

const parse = (html: string) => {
  const editor = createEditor({ extensions: [...starterKit, ...tableKit] as const })
  editor.setContent(html)
  return editor
}

describe('loose inline content finds a block', () => {
  it('keeps text in a list item written without a paragraph', () => {
    const editor = parse(
      '<ul><li>Press <strong>Mod-B</strong> for bold</li><li>Second</li></ul>',
    )
    expect(editor.getText()).toContain('Press Mod-B for bold')
    expect(editor.getText()).toContain('Second')
    expect(editor.getJSON().content?.[0]?.content).toHaveLength(2)
  })

  it('keeps marks inside that item', () => {
    const editor = parse('<ul><li>plain <em>and italic</em></li></ul>')
    const item = editor.getJSON().content?.[0]?.content?.[0]
    const text = item?.content?.[0]?.content
    expect(text?.[1]?.marks?.[0]?.type).toBe('italic')
  })

  it('keeps text in an ordered list written the same way', () => {
    expect(parse('<ol><li>one</li><li>two</li></ol>').getText()).toContain('two')
  })

  it('keeps text in a blockquote with no inner paragraph', () => {
    expect(parse('<blockquote>quoted directly</blockquote>').getText()).toContain(
      'quoted directly',
    )
  })

  it('keeps text in a table cell with no inner paragraph', () => {
    const editor = parse('<table><tbody><tr><td>cell text</td></tr></tbody></table>')
    expect(editor.getText()).toContain('cell text')
  })

  it('still handles a list item that does have a paragraph', () => {
    const editor = parse('<ul><li><p>wrapped</p></li></ul>')
    expect(editor.getText()).toContain('wrapped')
    expect(editor.getJSON().content?.[0]?.content?.[0]?.content).toHaveLength(1)
  })

  it('keeps a mixture of loose text and real blocks in one item', () => {
    const editor = parse('<ul><li>loose<p>block</p></li></ul>')
    const text = editor.getText()
    expect(text).toContain('loose')
    expect(text).toContain('block')
  })

  it('survives a nested list', () => {
    const editor = parse('<ul><li>outer<ul><li>inner</li></ul></li></ul>')
    expect(editor.getText()).toContain('outer')
    expect(editor.getText()).toContain('inner')
  })
})
