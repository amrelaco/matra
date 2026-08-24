/**
 * Dragging blocks.
 *
 * The geometry cannot be tested here — happy-dom reports every element as a
 * zero-sized box at the origin — so what is tested is the part that would be
 * wrong in a browser too: which block moves, where it lands, and whether the
 * arithmetic survives moving in both directions.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

const editor = (html: string) => createEditor({ extensions: starterKit, content: html })
const texts = (e: ReturnType<typeof editor>) =>
  (e.getJSON().content ?? []).map((node) => node.content?.[0]?.text ?? '')

/** Position where each top-level block starts. */
const starts = (e: ReturnType<typeof editor>) => {
  const out: number[] = []
  let at = 0
  for (const node of e.getJSON().content ?? []) {
    out.push(at)
    at += (node.content?.[0]?.text?.length ?? 0) + 2
  }
  out.push(at)
  return out
}

describe('moving a block', () => {
  it('moves one down past another', () => {
    const e = editor('<p>A</p><p>B</p><p>C</p>')
    const at = starts(e)
    expect(e.commands.moveBlock(at[0] as Pos, at[2] as Pos)).toBe(true)
    expect(texts(e)).toEqual(['B', 'A', 'C'])
  })

  it('moves one up past another', () => {
    const e = editor('<p>A</p><p>B</p><p>C</p>')
    const at = starts(e)
    expect(e.commands.moveBlock(at[2] as Pos, at[0] as Pos)).toBe(true)
    expect(texts(e)).toEqual(['C', 'A', 'B'])
  })

  it('moves one to the very end', () => {
    const e = editor('<p>A</p><p>B</p><p>C</p>')
    const at = starts(e)
    expect(e.commands.moveBlock(at[0] as Pos, at[3] as Pos)).toBe(true)
    expect(texts(e)).toEqual(['B', 'C', 'A'])
  })

  it('is one undo step, not half a move', () => {
    const e = editor('<p>A</p><p>B</p>')
    const at = starts(e)
    e.commands.moveBlock(at[0] as Pos, at[2] as Pos)
    expect(texts(e)).toEqual(['B', 'A'])
    e.commands.undo()
    expect(texts(e)).toEqual(['A', 'B'])
  })

  it('refuses to drop a block inside itself', () => {
    const e = editor('<p>Hello</p><p>B</p>')
    const at = starts(e)
    expect(e.commands.moveBlock(at[0] as Pos, 1 as Pos)).toBe(false)
    expect(e.commands.moveBlock(at[0] as Pos, at[0] as Pos)).toBe(false)
    expect(texts(e)).toEqual(['Hello', 'B'])
  })

  it('refuses a source that is not a block boundary', () => {
    const e = editor('<p>Hello</p><p>B</p>')
    const at = starts(e)
    // Position 1 is inside the first paragraph, not the start of a block.
    expect(e.commands.moveBlock(1 as Pos, at[2] as Pos)).toBe(false)
    expect(texts(e)).toEqual(['Hello', 'B'])
  })

  it('refuses hostile positions rather than throwing', () => {
    const e = editor('<p>A</p><p>B</p>')
    for (const bad of [Number.NaN, -1, 1e9, 1.5, Number.POSITIVE_INFINITY]) {
      expect(e.commands.moveBlock(bad as Pos, 0 as Pos)).toBe(false)
      expect(e.commands.moveBlock(0 as Pos, bad as Pos)).toBe(false)
    }
    expect(texts(e)).toEqual(['A', 'B'])
  })

  it('keeps the block whole, marks and all', () => {
    const e = editor('<p>plain</p><h2>Heading</h2>')
    const at = starts(e)
    e.commands.moveBlock(at[1] as Pos, at[0] as Pos)
    const first = e.getJSON().content?.[0]
    expect(first?.type).toBe('heading')
    expect(first?.attrs?.level).toBe(2)
  })

  it('survives being asked to move the only block', () => {
    const e = editor('<p>only</p>')
    const at = starts(e)
    expect(() => e.commands.moveBlock(at[0] as Pos, at[1] as Pos)).not.toThrow()
    expect(texts(e)).toEqual(['only'])
  })
})
