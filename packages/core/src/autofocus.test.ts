import { describe, expect, it } from 'vitest'
import { starterKit } from './extensions/starter-kit'
import { createEditor } from './index'

/**
 * `autofocus` has always been typed `boolean | 'start' | 'end'`, but the
 * implementation only ever checked truthiness — so the two string values were
 * indistinguishable from `true`, and the caret landed wherever it already was.
 */
describe('autofocus placement', () => {
  const mount = (autofocus: boolean | 'start' | 'end') => {
    const editor = createEditor({
      extensions: starterKit,
      content: '<p>one</p><p>two</p>',
      autofocus,
    })
    editor.mount(document.createElement('div'))
    return editor
  }

  it("puts the caret at the first text position for 'start'", () => {
    expect(mount('start').selection.from).toBe(1)
  })

  it("puts the caret at the last text position for 'end'", () => {
    // <p>one</p><p>two</p> — the second paragraph's text ends at 9.
    expect(mount('end').selection.from).toBe(9)
  })

  it('leaves the caret alone for true', () => {
    expect(mount(true).selection.from).toBe(1)
  })
})
