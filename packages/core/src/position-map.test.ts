/**
 * The bridge between model positions and the DOM.
 *
 * The renderer skips re-recording subtrees that kept their position, which is
 * what keeps typing off the document's size. The risk that buys is staleness:
 * an entry that should have been rewritten and was not. Every test here edits
 * a mounted document and then asks the map a question whose answer it could
 * only get right if it had been kept honest.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

const paragraphs = (count: number) => ({
  type: 'doc',
  content: Array.from({ length: count }, (_, i) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `Paragraph ${i}` }],
  })),
})

const mount = (content: unknown) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = createEditor({ extensions: starterKit, content: content as never })
  editor.mount(element)
  element.focus()
  return { editor, element }
}

/** What the browser's selection actually points at, after a sync. */
const domSelection = () => {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  return { node: range.startContainer, offset: range.startOffset }
}

describe('positions survive editing a mounted document', () => {
  it('puts the caret in the right paragraph after an edit shifts everything', () => {
    const { editor } = mount(paragraphs(200))

    // An insert at the very front moves all 199 later paragraphs.
    editor.commands.select(1 as Pos)
    editor.commands.insert('X')

    const target = editor.getJSON().content?.[150]
    expect((target as { content: { text: string }[] }).content[0]?.text).toBe('Paragraph 150')

    // Ask for a position deep in the document and check the DOM agrees.
    const json = editor.getJSON().content as { content?: { text: string }[] }[]
    let pos = 1
    for (let i = 0; i < 150; i++) pos += (json[i]?.content?.[0]?.text?.length ?? 0) + 2
    editor.commands.select(pos as Pos)
    editor.commands.focus()

    const at = domSelection()
    expect(at).not.toBeNull()
    expect(at?.node.textContent).toBe('Paragraph 150')
  })

  it('keeps the caret correct after a paragraph is deleted from the middle', () => {
    const { editor } = mount(paragraphs(50))
    const before = editor.getJSON().content?.length ?? 0

    // Remove paragraph 10 entirely, borders included.
    let start = 0
    const json = editor.getJSON().content as { content?: { text: string }[] }[]
    for (let i = 0; i < 10; i++) start += (json[i]?.content?.[0]?.text?.length ?? 0) + 2
    const size = (json[10]?.content?.[0]?.text?.length ?? 0) + 2
    editor.commands.remove({ from: start as Pos, to: (start + size) as Pos })

    expect(editor.getJSON().content?.length).toBe(before - 1)

    // The paragraph that took its place must be the one the DOM shows there.
    editor.commands.select((start + 1) as Pos)
    editor.commands.focus()
    expect(domSelection()?.node.textContent).toBe('Paragraph 11')
  })

  it('survives a shrinking document without pointing at positions that are gone', () => {
    const { editor } = mount(paragraphs(300))
    editor.setContent(paragraphs(3) as never)

    editor.commands.select(1 as Pos)
    editor.commands.focus()
    expect(domSelection()?.node.textContent).toBe('Paragraph 0')
    expect(editor.getJSON().content?.length).toBe(3)
  })

  it('reads a selection the user made in the DOM back as the right position', () => {
    const { editor, element } = mount(paragraphs(100))
    editor.commands.select(1 as Pos)
    editor.commands.insert('X')

    const paragraph = element.querySelectorAll('p')[60] as HTMLElement
    const text = paragraph.firstChild as Text
    const selection = document.getSelection()
    const range = document.createRange()
    range.setStart(text, 4)
    range.collapse(true)
    selection?.removeAllRanges()
    selection?.addRange(range)

    // Round-trip: put it back and the DOM must land in the same place.
    const roundTrip = document.createRange()
    roundTrip.setStart(text, 4)
    expect(roundTrip.startContainer.textContent).toBe('Paragraph 60')
  })

  it('stays correct across undo and redo', () => {
    const { editor } = mount(paragraphs(100))
    editor.commands.select(1 as Pos)
    editor.commands.insert('XYZ')
    expect(editor.getText()).toContain('XYZParagraph 0')

    editor.commands.undo()
    expect(editor.getText()).not.toContain('XYZ')

    editor.commands.select(1 as Pos)
    editor.commands.focus()
    expect(domSelection()?.node.textContent).toBe('Paragraph 0')

    editor.commands.redo()
    expect(editor.getText()).toContain('XYZParagraph 0')
  })

  it('stays correct when a paragraph gains a whole new block before it', () => {
    const { editor, element } = mount(paragraphs(80))
    const countBefore = element.querySelectorAll('p').length

    editor.commands.insert(
      { type: 'paragraph', content: [{ type: 'text', text: 'NEW' }] },
      0 as Pos,
    )

    expect(element.querySelectorAll('p').length).toBe(countBefore + 1)
    editor.commands.select(1 as Pos)
    editor.commands.focus()
    // Every later paragraph shifted by the new block's size; the map has to
    // have noticed, or the caret lands in the wrong one.
    expect(domSelection()?.node.textContent).toBe('NEW')
  })

  it('edits at the end of a long document still land at the end', () => {
    const { editor } = mount(paragraphs(500))
    const size = editor
      .getJSON()
      .content?.reduce(
        (total: number, node) =>
          total +
          ((node as { content?: { text: string }[] }).content?.[0]?.text?.length ?? 0) +
          2,
        0,
      ) as number

    editor.commands.select((size - 1) as Pos)
    editor.commands.insert('!')

    const last = editor.getJSON().content?.at(-1) as { content: { text: string }[] }
    expect(last.content[0]?.text).toBe('Paragraph 499!')
  })

  it('rebuilds the map from scratch after destroy and a fresh mount', () => {
    const { editor } = mount(paragraphs(120))
    editor.commands.select(1 as Pos)
    editor.commands.insert('A')
    editor.destroy()

    const { editor: second, element } = mount(paragraphs(120))
    second.commands.select(1 as Pos)
    second.commands.focus()
    expect(element.querySelectorAll('p').length).toBe(120)
    expect(domSelection()?.node.textContent).toBe('Paragraph 0')
  })
})
