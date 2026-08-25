/**
 * The renderer is allowed to skip work. This checks it never skips a change.
 *
 * The diff narrows to the region an edit touched and leaves the rest of the
 * document alone — which is the whole reason typing does not cost the size of
 * the document, and also exactly the kind of optimisation that goes wrong
 * silently. So rather than testing the mechanism, this compares what is on
 * screen against what is in the document after every edit, and fails the moment
 * they disagree.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

/** A tiny deterministic generator: a failing seed reproduces exactly. */
const random = (seed: number) => {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

const build = (count: number) => ({
  type: 'doc',
  content: Array.from({ length: count }, (_, i) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: `Paragraph ${i}` }],
  })),
})

/** What the DOM shows, block by block. */
const rendered = (element: HTMLElement) =>
  Array.from(element.children).map((child) => child.textContent ?? '')

/** What the document says, block by block. */
const modelled = (json: { content?: { content?: { text?: string }[] }[] }) =>
  (json.content ?? []).map((node) => (node.content ?? []).map((x) => x.text ?? '').join(''))

describe('the DOM never falls behind the document', () => {
  for (const seed of [1, 7, 42, 1337, 90210]) {
    it(`survives 200 random edits (seed ${seed})`, () => {
      const next = random(seed)
      const element = document.createElement('div')
      document.body.appendChild(element)
      const editor = createEditor({ extensions: starterKit, content: build(40) as never })
      editor.mount(element)

      for (let step = 0; step < 200; step++) {
        const size = editor
          .getJSON()
          .content?.reduce(
            (total, node) => total + ((node.content?.[0]?.text?.length ?? 0) + 2),
            0,
          ) as number
        const at = Math.max(1, Math.floor(next() * Math.max(1, size - 1)))
        const roll = next()

        if (roll < 0.45) {
          editor.commands.select(at as Pos)
          editor.commands.insert('x')
        } else if (roll < 0.7) {
          editor.commands.select({ from: at as Pos, to: Math.min(at + 3, size - 1) as Pos })
          editor.commands.remove()
        } else if (roll < 0.85) {
          // Whole new block: changes the child count, so the narrow path must
          // stand down rather than skip the shifted siblings.
          editor.commands.insert(
            { type: 'paragraph', content: [{ type: 'text', text: `new ${step}` }] },
            0 as Pos,
          )
        } else {
          editor.commands.undo()
        }

        expect(rendered(element)).toEqual(modelled(editor.getJSON()))
      }
    })
  }

  it('redraws a block edited far from the start', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = createEditor({ extensions: starterKit, content: build(500) as never })
    editor.mount(element)

    // Position inside paragraph 400.
    let at = 1
    const json = editor.getJSON().content as { content?: { text?: string }[] }[]
    for (let i = 0; i < 400; i++) at += (json[i]?.content?.[0]?.text?.length ?? 0) + 2

    editor.commands.select(at as Pos)
    editor.commands.insert('MARKER')

    expect(rendered(element)[400]).toContain('MARKER')
    expect(rendered(element)).toEqual(modelled(editor.getJSON()))
  })

  it('redraws the last block', () => {
    const element = document.createElement('div')
    document.body.appendChild(element)
    const editor = createEditor({ extensions: starterKit, content: build(300) as never })
    editor.mount(element)

    const size = editor
      .getJSON()
      .content?.reduce(
        (total, node) => total + ((node.content?.[0]?.text?.length ?? 0) + 2),
        0,
      ) as number
    editor.commands.select((size - 1) as Pos)
    editor.commands.insert('END')

    expect(rendered(element).at(-1)).toContain('END')
    expect(rendered(element)).toEqual(modelled(editor.getJSON()))
  })
})
