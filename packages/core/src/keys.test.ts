/**
 * Which binding a key press belongs to.
 *
 * Shift used to be ignored for single characters, on the reasoning that the
 * character already implies it. For letters it does not: `Mod-b` and
 * `Mod-Shift-b` are two bindings, and treating them as one meant Mod-B ran bold
 * and blockquote together.
 */
import { describe, expect, it } from 'vitest'
import { Keymap, parseBinding, strokeFromEvent, strokesMatch } from './engine/keys'

/** Whichever key `Mod` resolves to here — Cmd on Apple, Ctrl elsewhere. */
const MOD = parseBinding('Mod-a')

const event = (key: string, mods: { shift?: boolean; mod?: boolean } = {}) =>
  ({
    key,
    shiftKey: mods.shift ?? false,
    altKey: false,
    ctrlKey: mods.mod ? MOD.ctrl : false,
    metaKey: mods.mod ? MOD.meta : false,
  }) as KeyboardEvent

const press = (key: string, mods: { shift?: boolean; mod?: boolean } = {}) =>
  strokeFromEvent(event(key, mods))

describe('shift is part of the binding', () => {
  it('does not let Mod-b match a shifted press', () => {
    const bold = parseBinding('Mod-b')
    const shifted = press('b', { mod: true, shift: true })
    expect(strokesMatch(bold, shifted)).toBe(false)
  })

  it('does not let Mod-Shift-b match an unshifted press', () => {
    const quote = parseBinding('Mod-Shift-b')
    const plain = press('b', { mod: true })
    expect(strokesMatch(quote, plain)).toBe(false)
  })

  it('still matches its own stroke', () => {
    expect(strokesMatch(parseBinding('Mod-b'), press('b', { mod: true }))).toBe(true)
  })

  it('compares case-insensitively, so Mod-B is Mod-b', () => {
    expect(strokesMatch(parseBinding('Mod-B'), press('b', { mod: true }))).toBe(true)
  })
})

describe('bold and blockquote do not fire together', () => {
  it('runs only one of them', () => {
    const fired: string[] = []
    const keys = new Keymap()
    keys.add('Mod-b', () => {
      fired.push('bold')
      return true
    })
    keys.add('Mod-Shift-b', () => {
      fired.push('blockquote')
      return true
    })

    keys.handle(event('b', { mod: true }))

    expect(fired).toEqual(['bold'])
  })

  it('runs the shifted one when shift is held', () => {
    const fired: string[] = []
    const keys = new Keymap()
    keys.add('Mod-b', () => {
      fired.push('bold')
      return true
    })
    keys.add('Mod-Shift-b', () => {
      fired.push('blockquote')
      return true
    })

    keys.handle(event('b', { mod: true, shift: true }))

    expect(fired).toEqual(['blockquote'])
  })
})

describe('sharing a stroke is still allowed', () => {
  it('falls through when the first binding declines', () => {
    const fired: string[] = []
    const keys = new Keymap()
    keys.add('Enter', () => {
      fired.push('first')
      return false
    })
    keys.add('Enter', () => {
      fired.push('second')
      return true
    })

    keys.handle(event('Enter'))

    expect(fired).toEqual(['first', 'second'])
  })
})
