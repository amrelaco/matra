/**
 * Structure changes that keep their content in place, and say so.
 *
 * A paragraph made a heading, a run of blocks wrapped in a list, an item
 * nested under the one above: each keeps nearly everything it replaces
 * exactly where it was. The step's map has to say that, or the caret ends up
 * at the end of the block and a selection that was just turned into a list
 * cannot be bolded next, because there is no selection left.
 */
import { describe, expect, it } from 'vitest'
import { Fragment } from '../model/fragment'
import { Schema } from '../model/schema'
import { Slice } from './slice'
import { ReplaceStep, stepFromJSON } from './step'
import { Mapping, StepMap } from './step-map'
import { Transform } from './transform'

const schema = new Schema({
  nodes: [
    { name: 'doc', content: 'block+' },
    { name: 'paragraph', content: 'inline*', group: 'block' },
    { name: 'heading', content: 'inline*', group: 'block', attrs: { level: { default: 1 } } },
    { name: 'blockquote', content: 'block+', group: 'block' },
    { name: 'text', group: 'inline' },
  ],
  marks: [],
})

const p = (text: string) => schema.node('paragraph', null, text ? [schema.text(text)] : [])
const docOf = (...text: string[]) => schema.node('doc', null, text.map(p))
const heading = schema.nodes.heading as NonNullable<typeof schema.nodes.heading>
const blockquote = schema.nodes.blockquote as NonNullable<typeof schema.nodes.blockquote>

describe('retyping a block', () => {
  it('keeps every position inside it', () => {
    const tr = new Transform(docOf('hello world'))
    tr.setBlockType(1, 6, heading, { level: 2 })
    expect(tr.doc.firstChild?.type.name).toBe('heading')
    for (const pos of [0, 1, 3, 6, 12, 13]) expect(tr.mapping.map(pos)).toBe(pos)
    expect(tr.mapping.mapResult(3).deleted).toBe(false)
  })

  it('still reports the block as changed, so the view redraws it', () => {
    const tr = new Transform(docOf('hello'))
    tr.setBlockType(1, 1, heading)
    let from = Number.POSITIVE_INFINITY
    let to = 0
    ;(tr.mapping.maps[0] as StepMap).forEach((_a, _b, newStart, newEnd) => {
      from = Math.min(from, newStart)
      to = Math.max(to, newEnd)
    })
    expect([from, to]).toEqual([0, 7])
  })

  it('undoes to the same positions', () => {
    const tr = new Transform(docOf('hello'))
    tr.setBlockType(1, 1, heading)
    const back = new Transform(tr.doc)
    for (const step of tr.invert()) back.step(step)
    expect(back.doc.eq(docOf('hello'))).toBe(true)
    expect(back.mapping.map(3)).toBe(3)
  })
})

describe('wrapping and lifting', () => {
  it('shifts positions by the tokens added and nothing more', () => {
    const tr = new Transform(docOf('hello', 'world'))
    const range = tr.doc.resolve(1).blockRange(tr.doc.resolve(10))
    if (!range) throw new Error('no range')
    tr.wrap(range, [{ type: blockquote }])
    expect(tr.doc.firstChild?.type.name).toBe('blockquote')
    expect(tr.mapping.map(1)).toBe(2)
    expect(tr.mapping.map(10)).toBe(11)
    expect(tr.mapping.map(14)).toBe(16)
    expect(tr.mapping.mapResult(5).deleted).toBe(false)
  })

  it('comes back exactly when the wrapper is lifted', () => {
    const doc = schema.node('doc', null, [schema.node('blockquote', null, [p('hello')])])
    const tr = new Transform(doc)
    const range = tr.doc.resolve(2).blockRange(tr.doc.resolve(2))
    if (!range) throw new Error('no range')
    tr.lift(range, 0)
    expect(tr.doc.eq(docOf('hello'))).toBe(true)
    expect(tr.mapping.map(4)).toBe(3)
    expect(tr.mapping.mapResult(4).deleted).toBe(false)
  })

  it('splits a block around the caret', () => {
    const tr = new Transform(docOf('hello'))
    tr.split(3)
    expect(tr.doc.childCount).toBe(2)
    expect(tr.mapping.map(2)).toBe(2)
    expect(tr.mapping.map(3, -1)).toBe(3)
    expect(tr.mapping.map(3, 1)).toBe(5)
    expect(tr.mapping.map(5)).toBe(7)
  })
})

describe('the step itself', () => {
  const doc = docOf('hello')
  const replaced = new Slice(
    Fragment.from(heading.create(null, (doc.firstChild as typeof doc).content)),
  )
  const step = new ReplaceStep(0, 7, replaced, [0, 1, 1, 6, 1, 1])

  it('survives JSON, and is readable without its ranges', () => {
    const json = step.toJSON()
    expect(json.ranges).toEqual([0, 1, 1, 6, 1, 1])
    const back = stepFromJSON(schema, json) as ReplaceStep
    expect(back.ranges).toEqual([0, 1, 1, 6, 1, 1])
    const { ranges: _dropped, ...older } = json
    const coarse = stepFromJSON(schema, older) as ReplaceStep
    expect(coarse.ranges).toBeNull()
    expect(coarse.apply(doc).doc?.eq(step.apply(doc).doc as typeof doc)).toBe(true)
  })

  it('moves its ranges past an earlier insertion when rebased', () => {
    const moved = step.map(new Mapping([new StepMap([0, 0, 4])])) as ReplaceStep
    expect(moved.from).toBe(4)
    expect(moved.ranges).toEqual([4, 1, 1, 10, 1, 1])
  })

  it('falls back to the plain map when the structure was cut through', () => {
    // The block's closing token was deleted along with the text before it.
    const moved = step.map(new Mapping([new StepMap([4, 3, 0])])) as ReplaceStep
    expect(moved.ranges).toBeNull()
  })

  it('refuses kept runs that are out of order', () => {
    const tr = new Transform(docOf('a', 'b'))
    tr.rebuild(0, 6, [p('b'), p('a')], [3, 6, 0, 0, 3, 3])
    expect((tr.steps[0] as ReplaceStep).ranges).toBeNull()
    expect(tr.doc.textContent).toBe('ba')
  })
})
