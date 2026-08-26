/**
 * A node may say which marks its text can carry.
 *
 * The code block always meant to say "none" — the comment above it said so —
 * but `NodeDef` had no field to say it in, so the declaration never reached the
 * schema. `NodeType.allowsMarkType` existed, was unit-tested, and was called by
 * nothing at all.
 *
 * What that cost: pasting `<pre><code>x</code></pre>` read the fence's own
 * `<code>` tag as an inline code mark, and the same document came back out as
 * `<pre><code><code>x</code></code></pre>`. Bold inside a fence applied
 * happily. This is the test for all of it.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

const editor = (content: string) => createEditor({ extensions: starterKit, content })

describe('a node that accepts no marks', () => {
  it('parses a fence without reading its own tag as a mark', () => {
    const it = editor('<pre><code>const x = 1</code></pre>')
    const block = it.getJSON().content?.[0]

    expect(block?.type).toBe('codeBlock')
    expect(block?.content?.[0]?.marks).toBeUndefined()
    // The round trip is the thing anybody would actually notice.
    expect(it.getHTML()).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('refuses a mark over a range inside it', () => {
    const it = editor('<pre><code>const x = 1</code></pre>')
    it.commands.select({ from: 1 as Pos, to: 6 as Pos })

    expect(it.commands.toggleBold()).toBe(false)
    expect(it.getHTML()).toBe('<pre><code>const x = 1</code></pre>')
  })

  it('refuses a stored mark with the caret inside it', () => {
    const it = editor('<pre><code>const x = 1</code></pre>')
    it.commands.select(3 as Pos)

    // A stored mark applies to what you type next, which lands in this block.
    expect(it.commands.toggleBold()).toBe(false)
  })

  it('drops a mark carried in from outside', () => {
    const it = editor('<pre><code><strong>bold</strong> and plain</code></pre>')
    expect(it.getHTML()).toBe('<pre><code>bold and plain</code></pre>')
  })
})

describe('everything else still takes marks', () => {
  it('marks a range in a paragraph', () => {
    const it = editor('<p>hello world</p>')
    it.commands.select({ from: 1 as Pos, to: 6 as Pos })

    expect(it.commands.toggleBold()).toBe(true)
    expect(it.getHTML()).toBe('<p><strong>hello</strong> world</p>')
  })

  it('stores a mark with the caret in a paragraph', () => {
    const it = editor('<p>hello</p>')
    it.commands.select(3 as Pos)
    expect(it.commands.toggleBold()).toBe(true)
  })

  it('keeps the marks a paragraph came in with', () => {
    const it = editor('<p>a <strong>b</strong> and <code>c</code></p>')
    expect(it.getHTML()).toBe('<p>a <strong>b</strong> and <code>c</code></p>')
  })

  it('marks the half of a range that can take it, and reports success', () => {
    const it = editor('<p>text</p><pre><code>code</code></pre>')
    it.commands.select({ from: 1 as Pos, to: 11 as Pos })

    // Something in the range took it, so this really did do something.
    expect(it.commands.toggleBold()).toBe(true)
    expect(it.getHTML()).toBe('<p><strong>text</strong></p><pre><code>code</code></pre>')
  })
})
