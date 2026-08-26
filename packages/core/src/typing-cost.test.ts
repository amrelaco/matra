/**
 * Typing must not cost the size of the document.
 *
 * Three things made it cost the document, and all three are the kind of thing
 * that comes back the moment nobody is looking, so each one is pinned here by
 * a consequence rather than by a timing:
 *
 *   - every ancestor of the edit was rebuilt by cutting its children in two and
 *     joining them back around the replacement
 *   - the diff reached into the DOM for every block, including the ones it had
 *     already decided not to touch
 *   - and every sixty-fourth keystroke threw the whole rendered document away
 *     and built it again, because the position map's backlog was full
 *
 * The last one is the one worth a test: a rebuild is invisible until you notice
 * that the element you were holding is not the one on screen any more — which
 * is also what a mounted node view, an IME candidate window and a scroll
 * position each find out the hard way.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { Fragment } from './engine/model/fragment'
import { Schema } from './engine/model/schema'
import { starterKit } from './extensions'
import type { Pos } from './types'

const build = (count: number) => ({
  type: 'doc',
  content: Array.from({ length: count }, (_, i) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `Paragraph ${i}` }],
  })),
})

const mount = (count: number) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = createEditor({ extensions: starterKit, content: build(count) as never })
  editor.mount(element)
  return { editor, element }
}

describe('the rendered document survives a long run of edits', () => {
  it('keeps the same elements across more edits than the map holds', () => {
    const { editor, element } = mount(40)
    const first = element.children[0]
    const last = element.children[39]

    // Comfortably past MAX_PENDING, which is what used to force the rebuild.
    for (let i = 0; i < 200; i++) {
      editor.commands.select(1 as Pos)
      editor.commands.insert('x')
    }

    expect(element.children[0]).toBe(first)
    expect(element.children[39]).toBe(last)
    expect(element.children.length).toBe(40)
  })

  it('still knows where every block is afterwards', () => {
    const { editor, element } = mount(40)
    for (let i = 0; i < 200; i++) {
      editor.commands.select(1 as Pos)
      editor.commands.insert('x')
    }

    // The last block is the one furthest from the edit, so it is the one whose
    // position is most wrong if the map fell behind. Typing into it is the only
    // question worth asking: does the character land where the caret is.
    const doc = editor.getJSON()
    const size = (doc.content ?? []).reduce(
      (total, node) => total + ((node.content?.[0]?.text?.length ?? 0) + 2),
      0,
    )
    editor.commands.select((size - 1) as Pos)
    editor.commands.insert('!')

    const blocks = (editor.getJSON().content ?? []).map((node) => node.content?.[0]?.text ?? '')
    expect(blocks[39]).toBe('Paragraph 39!')
    expect(blocks[38]).toBe('Paragraph 38')
    expect(element.children[39]?.textContent).toBe('Paragraph 39!')
  })

  it('draws an edit at the far end of a long document', () => {
    const { editor, element } = mount(400)
    for (let i = 0; i < 100; i++) {
      editor.commands.select(1 as Pos)
      editor.commands.insert('y')
    }
    const doc = editor.getJSON()
    const size = (doc.content ?? []).reduce(
      (total, node) => total + ((node.content?.[0]?.text?.length ?? 0) + 2),
      0,
    )
    editor.commands.select((size - 1) as Pos)
    editor.commands.insert('z')

    expect(element.children[399]?.textContent).toBe('Paragraph 399z')
  })
})

describe('a run with one child swapped', () => {
  const schema = new Schema({
    nodes: [
      { name: 'doc', content: 'block+' },
      { name: 'paragraph', content: 'inline*', group: 'block' },
      { name: 'text', group: 'inline' },
    ],
    marks: [],
  })
  const para = (words: string) => schema.node('paragraph', null, [schema.text(words)])

  it('carries the size across without re-adding the children', () => {
    const run = Fragment.from([para('one'), para('two'), para('three')])
    const next = run.replaceChild(1, para('a much longer paragraph'))

    expect(next.size).toBe(next.content.reduce((total, node) => total + node.nodeSize, 0))
    expect(next.child(0)).toBe(run.child(0))
    expect(next.child(2)).toBe(run.child(2))
    expect(next.childCount).toBe(3)
  })

  it('returns the same run when the child is the one already there', () => {
    const run = Fragment.from([para('one'), para('two')])
    expect(run.replaceChild(0, run.child(0))).toBe(run)
  })

  it('still merges when text is involved, because text merges', () => {
    const run = Fragment.from([schema.text('one'), para('block'), schema.text('two')])
    const merged = run.replaceChild(1, schema.text('-'))

    // 'one' + '-' + 'two' is one text node, not three.
    expect(merged.childCount).toBe(1)
    expect(merged.child(0).text).toBe('one-two')
    expect(merged.size).toBe(7)
  })

  it('refuses an index that is not there', () => {
    const run = Fragment.from([para('one')])
    expect(() => run.replaceChild(4, para('two'))).toThrow(/no child at index/)
  })
})
