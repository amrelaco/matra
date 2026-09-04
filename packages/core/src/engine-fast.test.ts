/**
 * What the 0.17 engine work changed, pinned by consequence.
 *
 * Each of these is a thing that was slow or wrong and is now neither. They
 * assert the visible result — where the caret is, which elements survived,
 * what a marker says — rather than the mechanism, so a later rewrite is free
 * to find a better mechanism as long as the result holds.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { Fragment } from './engine/model/fragment'
import { Schema } from './engine/model/schema'
import { search, starterKit } from './extensions'
import type { Pos } from './types'

const build = (count: number, text = (i: number) => `Paragraph ${i}`) => ({
  type: 'doc',
  content: Array.from({ length: count }, (_, i) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: text(i) }],
  })),
})

const mount = (editor: { mount(el: HTMLElement): void }) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

describe('the caret after a programmatic edit', () => {
  it('sits right after what was inserted', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
    editor.commands.select(3 as Pos)
    editor.commands.insert('X')
    expect(editor.getText()).toBe('heXllo')
    expect(editor.selection.from).toBe(4)
    editor.commands.insert('Y')
    expect(editor.getText()).toBe('heXYllo')
  })

  it('covers a replacement, and nothing beyond it', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>hello world</p>' })
    editor.commands.select({ from: 7 as Pos, to: 12 as Pos })
    editor.commands.replace({ from: 7 as Pos, to: 12 as Pos }, 'there')
    expect(editor.getText()).toBe('hello there')
    expect(editor.selection.from).toBe(7)
    expect(editor.selection.to).toBe(12)
  })

  it('splits a paragraph to make room for a block', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>before after</p>' })
    editor.commands.select(7 as Pos)
    expect(editor.commands.insertHorizontalRule()).toBe(true)
    expect(editor.getHTML()).toBe('<p>before</p><hr><p> after</p>')
    expect(editor.selection.from).toBe(10)
    // At the very end, a paragraph is left to keep typing in.
    editor.commands.select(16 as Pos)
    editor.commands.insertHorizontalRule()
    expect(editor.getHTML()).toBe('<p>before</p><hr><p> after</p><hr><p></p>')
    expect(editor.selection.from).toBe(19)
  })
})

describe('position lookup in a long run', () => {
  const schema = new Schema({
    nodes: [
      { name: 'doc', content: 'block+' },
      { name: 'paragraph', content: 'inline*', group: 'block' },
      { name: 'text', group: 'inline' },
    ],
    marks: [],
  })
  const para = (words: string) => schema.node('paragraph', null, [schema.text(words)])

  it('agrees with a walk, for every position', () => {
    const nodes = Array.from({ length: 60 }, (_, i) => para('x'.repeat((i * 7) % 11)))
    const run = Fragment.from(nodes)
    let offset = 0
    let index = 0
    for (let pos = 0; pos <= run.size; pos++) {
      while (index < nodes.length && offset + (nodes[index]?.nodeSize ?? 0) <= pos) {
        offset += nodes[index]?.nodeSize ?? 0
        index++
      }
      const expected =
        pos === run.size ? { index: nodes.length, offset: run.size } : { index, offset }
      expect(run.findIndex(pos)).toEqual(expected)
    }
  })

  it('survives a child being swapped', () => {
    const nodes = Array.from({ length: 40 }, (_, i) => para(`p${i}`))
    const run = Fragment.from(nodes)
    run.findIndex(50)
    const next = run.replaceChild(10, para('a much longer paragraph than before'))
    let offset = 0
    for (let i = 0; i < next.childCount; i++) {
      expect(next.findIndex(offset + 1)).toEqual({ index: i, offset })
      offset += next.child(i).nodeSize
    }
    expect(next.size).toBe(offset)
  })

  it('replaces a run of children without re-adding the rest', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => para(`p${i}`))
    const run = Fragment.from(nodes)
    const next = run.replaceRange(5, 8, [para('one'), para('two')])
    expect(next.childCount).toBe(29)
    expect(next.child(4)).toBe(run.child(4))
    expect(next.child(7)).toBe(run.child(8))
    expect(next.size).toBe(next.content.reduce((total, node) => total + node.nodeSize, 0))
  })
})

describe('walking only what a range touches', () => {
  it('visits the same nodes descendants would, and no others', () => {
    const editor = createEditor({
      extensions: starterKit,
      content:
        '<p>one <strong>two</strong></p><ul><li><p>three</p></li><li><p>four <em>five</em></p></li></ul><p>six</p>',
    })
    const doc = editor.unsafe.state as {
      doc: {
        content: { size: number }
        descendants(fn: (node: { nodeSize: number }, pos: number) => undefined): void
        nodesBetween(
          from: number,
          to: number,
          fn: (node: { nodeSize: number }, pos: number) => undefined,
        ): void
      }
    }
    const size = doc.doc.content.size
    for (let from = 0; from <= size; from += 3) {
      for (let to = from; to <= size; to += 5) {
        const expected: number[] = []
        doc.doc.descendants((node, pos) => {
          if (pos + node.nodeSize > from && pos < to) expected.push(pos)
          return undefined
        })
        const got: number[] = []
        doc.doc.nodesBetween(from, to, (_node, pos) => {
          got.push(pos)
          return undefined
        })
        expect(got).toEqual(expected)
      }
    }
  })

  it('leaves every untouched block the same object after a mark', () => {
    const editor = createEditor({ extensions: starterKit, content: build(200) as never })
    const before = (editor.unsafe.state as { doc: { child(i: number): unknown } }).doc
    const size = (editor.unsafe.state as { doc: { content: { size: number } } }).doc.content
      .size
    editor.commands.select({ from: (size - 10) as Pos, to: (size - 3) as Pos })
    editor.commands.toggleBold()
    const after = (editor.unsafe.state as { doc: { child(i: number): unknown } }).doc
    for (let i = 0; i < 199; i++) expect(after.child(i)).toBe(before.child(i))
    expect(after.child(199)).not.toBe(before.child(199))
    expect(editor.getHTML().endsWith('<strong>graph 1</strong>99</p>')).toBe(true)
  })
})

describe('what a keystroke leaves alone on screen', () => {
  it('updates the text node in place rather than rebuilding the block', () => {
    const editor = createEditor({
      extensions: starterKit,
      content: '<p>plain <strong>bold</strong> tail</p>',
    })
    const element = mount(editor)
    const paragraph = element.firstChild as HTMLElement
    const plain = paragraph.firstChild as Text
    const strong = paragraph.querySelector('strong') as HTMLElement
    const bold = strong.firstChild as Text
    editor.commands.select(3 as Pos)
    editor.commands.insert('!')
    expect(element.firstChild).toBe(paragraph)
    expect(paragraph.firstChild).toBe(plain)
    expect(plain.nodeValue).toBe('pl!ain ')
    expect(paragraph.querySelector('strong')).toBe(strong)
    expect(strong.firstChild).toBe(bold)
    expect(paragraph.textContent).toBe('pl!ain bold tail')
  })

  it('rebuilds when the shape changes', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>plain text</p>' })
    const element = mount(editor)
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleBold()
    expect(element.innerHTML).toBe('<p><strong>plain</strong> text</p>')
  })

  it('keeps decorated blocks elsewhere untouched while typing', () => {
    const editor = createEditor({
      extensions: [...starterKit, search()] as const,
      content: build(30, (i) => `Block ${i} with a fox in it`) as never,
    })
    const element = mount(editor)
    editor.commands.setSearch('fox')
    expect(element.querySelectorAll('.matra-search-match')).toHaveLength(30)
    const kept = Array.from(element.children).slice(5, 30)
    editor.commands.select(1 as Pos)
    editor.commands.insert('Typed. ')
    expect(Array.from(element.children).slice(5, 30)).toEqual(kept)
    expect(element.querySelectorAll('.matra-search-match')).toHaveLength(30)
    expect(element.children[0]?.querySelector('.matra-search-match')?.textContent).toBe('fox')
  })
})

describe('history under a burst of typing', () => {
  it('undoes the burst as one entry and redoes it whole', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p></p>' })
    for (const character of 'hello world') {
      editor.commands.select(editor.selection.to)
      editor.commands.insert(character)
    }
    expect(editor.getText()).toBe('hello world')
    editor.commands.undo()
    expect(editor.getText()).toBe('')
    editor.commands.redo()
    expect(editor.getText()).toBe('hello world')
  })
})

describe('what is shared between editors', () => {
  it('compiles one schema for one extension array', () => {
    const a = createEditor({ extensions: starterKit })
    const b = createEditor({ extensions: starterKit })
    expect(a.unsafe.schema).toBe(b.unsafe.schema)
    const own = [...starterKit]
    const c = createEditor({ extensions: own })
    expect(c.unsafe.schema).not.toBe(a.unsafe.schema)
    expect(createEditor({ extensions: own }).unsafe.schema).toBe(c.unsafe.schema)
  })

  it('does not share what belongs to one editor', () => {
    const a = createEditor({ extensions: starterKit, content: '<p>a</p>' })
    const b = createEditor({ extensions: starterKit, content: '<p>b</p>' })
    a.commands.select(2 as Pos)
    a.commands.insert('!')
    expect(b.getText()).toBe('b')
    a.commands.undo()
    expect(a.getText()).toBe('a')
    expect(b.getText()).toBe('b')
  })
})

describe('a marker held across many edits', () => {
  it('still maps correctly after the mapping log has been swept', () => {
    const editor = createEditor({ extensions: starterKit, content: '<p>start end</p>' })
    let marker: { map(pos: Pos): Pos } | null = null
    const take = {
      kind: 'extension' as const,
      name: 'take',
      commands: {
        take: (ctx: { mark(): { map(pos: Pos): Pos } }) => {
          marker = ctx.mark()
          return true
        },
      },
    }
    const taking = createEditor({
      extensions: [...starterKit, take] as const,
      content: '<p>start end</p>',
    })
    void editor
    taking.commands.take()
    // Well past the sweep interval, every edit before the word "end".
    for (let i = 0; i < 700; i++) {
      taking.commands.select(1 as Pos)
      taking.commands.insert('x')
    }
    expect(marker).not.toBeNull()
    expect((marker as unknown as { map(pos: Pos): Pos }).map(7 as Pos)).toBe(707)
  })
})

describe('ctx.doc', () => {
  it('is the same object twice within one command', () => {
    let same = false
    const probe = {
      kind: 'extension' as const,
      name: 'probe',
      commands: {
        probe: (ctx: { doc: unknown; insert(text: string): boolean }) => {
          const first = ctx.doc
          same = first === ctx.doc
          ctx.insert('x')
          same = same && first !== ctx.doc
          return true
        },
      },
    }
    const editor = createEditor({
      extensions: [...starterKit, probe] as const,
      content: '<p></p>',
    })
    editor.commands.probe()
    expect(same).toBe(true)
  })
})
