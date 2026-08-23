import { describe, expect, it } from 'vitest'
import { Mapping, StepMap } from './step-map'

/** [start, oldSize, newSize] — "replace `oldSize` chars at `start` with `newSize`". */
const map = (...ranges: number[]) => new StepMap(ranges)

describe('mapping a single change', () => {
  it('leaves positions before the change alone', () => {
    const m = map(5, 0, 3)
    expect(m.map(0)).toBe(0)
    expect(m.map(4)).toBe(4)
  })

  it('shifts positions after an insertion', () => {
    const m = map(5, 0, 3)
    expect(m.map(6)).toBe(9)
    expect(m.map(20)).toBe(23)
  })

  it('shifts positions after a deletion', () => {
    const m = map(5, 3, 0)
    expect(m.map(10)).toBe(7)
  })

  it('uses assoc to decide the side of an insertion point', () => {
    const m = map(5, 0, 3)
    expect(m.map(5, -1)).toBe(5)
    expect(m.map(5, 1)).toBe(8)
  })

  it('sticks the ends of a replaced span', () => {
    const m = map(5, 4, 2)
    expect(m.map(5)).toBe(5)
    expect(m.map(9)).toBe(7)
  })

  it('reports positions swallowed by a deletion', () => {
    const m = map(5, 4, 0)
    expect(m.mapResult(7).deleted).toBe(true)
    expect(m.mapResult(5).deleted).toBe(false)
    expect(m.mapResult(9).deleted).toBe(false)
  })

  it('handles several ranges in one change', () => {
    // delete 2 at 1, insert 3 at 10
    const m = map(1, 2, 0, 10, 0, 3)
    expect(m.map(0)).toBe(0)
    expect(m.map(5)).toBe(3)
    expect(m.map(12)).toBe(13)
  })
})

describe('inverting', () => {
  it('round-trips positions outside every changed span', () => {
    for (const ranges of [
      [5, 0, 3],
      [5, 3, 0],
      [5, 4, 2],
      [1, 2, 0, 10, 0, 3],
    ]) {
      const forward = new StepMap(ranges)
      const back = forward.invert()
      // 0 and 4 sit before every span here; 30 and 100 after all of them.
      for (const pos of [0, 4, 30, 100]) {
        expect(back.map(forward.map(pos))).toBe(pos)
      }
    }
  })

  it('cannot un-collapse the edges of a deletion', () => {
    // Deleting [5,6) sends both 5 and 6 to 5. Which one it was is genuinely
    // gone, so inverting picks a side rather than guessing — assoc says which.
    const forward = map(5, 1, 0)
    expect(forward.map(5)).toBe(5)
    expect(forward.map(6)).toBe(5)

    const back = forward.invert()
    expect(back.map(5, -1)).toBe(5)
    expect(back.map(5, 1)).toBe(6)
  })
})

describe('mapping through many changes', () => {
  it('applies maps in order', () => {
    const mapping = new Mapping([map(0, 0, 5), map(0, 0, 5)])
    expect(mapping.map(0, 1)).toBe(10)
    expect(mapping.map(3)).toBe(13)
  })

  it('remembers a deletion anywhere in the chain', () => {
    const mapping = new Mapping([map(5, 4, 0), map(0, 0, 2)])
    expect(mapping.mapResult(7).deleted).toBe(true)
  })

  it('inverts the whole chain in reverse', () => {
    const mapping = new Mapping([map(0, 0, 5), map(20, 3, 1)])
    const back = mapping.invert()
    for (const pos of [0, 1, 15, 40]) {
      expect(back.map(mapping.map(pos))).toBe(pos)
    }
  })

  it('slices to a window of the chain', () => {
    const mapping = new Mapping([map(0, 0, 5), map(0, 0, 5), map(0, 0, 5)])
    expect(mapping.slice(1).map(0, 1)).toBe(10)
    expect(mapping.slice(0, 1).map(0, 1)).toBe(5)
  })
})

describe('fuzz', () => {
  /** Deterministic generator — a failure must be reproducible. */
  const rng = (seed: number) => {
    let state = seed
    return () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      return state / 0x7fffffff
    }
  }

  it('never moves a position backwards past an earlier one', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const random = rng(seed)
      const ranges: number[] = []
      let cursor = 0
      for (let i = 0; i < 4; i++) {
        cursor += Math.floor(random() * 6)
        const oldSize = Math.floor(random() * 5)
        const newSize = Math.floor(random() * 5)
        ranges.push(cursor, oldSize, newSize)
        cursor += oldSize
      }
      const m = new StepMap(ranges)
      let previous = Number.NEGATIVE_INFINITY
      for (let pos = 0; pos <= cursor + 10; pos++) {
        const mapped = m.map(pos)
        expect(mapped).toBeGreaterThanOrEqual(previous)
        previous = mapped
      }
    }
  })

  it('inverting returns every position outside the change exactly', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const random = rng(seed)
      const start = Math.floor(random() * 10)
      const oldSize = Math.floor(random() * 6)
      const newSize = Math.floor(random() * 6)
      const forward = new StepMap([start, oldSize, newSize])
      const back = forward.invert()
      for (let pos = 0; pos <= 25; pos++) {
        // Both edges of a replaced span collapse together, so only positions
        // strictly outside it can be recovered.
        if (pos >= start && pos <= start + oldSize) continue
        expect(back.map(forward.map(pos))).toBe(pos)
      }
    }
  })

  it('a chain of changes equals applying them one at a time', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const random = rng(seed)
      const maps = Array.from({ length: 3 }, () => {
        const start = Math.floor(random() * 8)
        return new StepMap([start, Math.floor(random() * 4), Math.floor(random() * 4)])
      })
      const mapping = new Mapping(maps)
      for (let pos = 0; pos <= 20; pos++) {
        let stepwise = pos
        for (const m of maps) stepwise = m.map(stepwise)
        expect(mapping.map(pos)).toBe(stepwise)
      }
    }
  })
})
