import { describe, expect, it } from 'vitest'
import { createEditor } from '../editor'
import { starterKit } from '../extensions'
import type { Pos } from '../types'
import { InputRules } from './input-rules'
import { Keymap, parseBinding, strokesMatch } from './keys'

describe('keymap', () => {
  it('parses modifiers and maps Mod to the platform key', () => {
    const stroke = parseBinding('Mod-Shift-x')
    expect(stroke.key).toBe('x')
    expect(stroke.shift).toBe(true)
    expect(stroke.ctrl || stroke.meta).toBe(true)
  })

  it('rejects an unknown modifier instead of silently ignoring it', () => {
    expect(() => parseBinding('Hyper-x')).toThrow(/unknown key modifier/)
  })

  it('treats Mod-B and Mod-b as the same binding', () => {
    expect(strokesMatch(parseBinding('Mod-B'), parseBinding('Mod-b'))).toBe(true)
  })

  it('compares shift only for named keys', () => {
    // Shift-Enter and Enter are different bindings.
    expect(strokesMatch(parseBinding('Shift-Enter'), parseBinding('Enter'))).toBe(false)
  })

  it('fires the first binding that claims the event', () => {
    const fired: string[] = []
    const keys = new Keymap()
    keys.add('Mod-b', () => {
      fired.push('first')
      return false
    })
    keys.add('Mod-b', () => {
      fired.push('second')
      return true
    })
    // Build the event from the parsed binding so the test is platform-correct.
    const mod = parseBinding('Mod-b')
    const handled = keys.handle(
      new KeyboardEvent('keydown', { key: 'b', metaKey: mod.meta, ctrlKey: mod.ctrl }),
    )
    expect(handled).toBe(true)
    expect(fired).toEqual(['first', 'second'])
  })
})

describe('input rules', () => {
  it('hands the handler the span it matched', () => {
    const rules = new InputRules([{ match: /^##\s$/, handler: () => true }])
    let seen: { from: number; to: number } | null = null
    const handled = rules.handle(
      { before: '##', start: 1 as Pos, from: 3 as Pos, to: 3 as Pos },
      ' ',
      (_rule, _match, range) => {
        seen = { from: range.from, to: range.to }
        return true
      },
    )
    expect(handled).toBe(true)
    // "##" plus the typed space: three characters ending at the caret.
    expect(seen).toEqual({ from: 1, to: 3 })
  })

  it('does nothing when no rule matches', () => {
    const rules = new InputRules([{ match: /^##\s$/, handler: () => true }])
    const handled = rules.handle(
      { before: 'hello', start: 1 as Pos, from: 6 as Pos, to: 6 as Pos },
      'x',
      () => true,
    )
    expect(handled).toBe(false)
  })
})

describe('history', () => {
  const editorWith = (content = '<p>hello</p>') =>
    createEditor({ extensions: starterKit, content })

  it('rewinds one change and replays it', () => {
    const editor = editorWith()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleBold()
    expect(editor.getHTML()).toContain('<strong>')

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getHTML()).toBe('<p>hello</p>')

    expect(editor.commands.redo()).toBe(true)
    expect(editor.getHTML()).toContain('<strong>')
  })

  it('reports false with nothing to rewind', () => {
    const editor = editorWith()
    expect(editor.commands.undo()).toBe(false)
    expect(editor.commands.redo()).toBe(false)
  })

  it('drops the redo branch once a new edit lands', () => {
    const editor = editorWith()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleBold()
    editor.commands.undo()

    editor.commands.select({ from: 6 as Pos, to: 6 as Pos })
    editor.commands.insert('!')
    expect(editor.commands.redo()).toBe(false)
  })

  it('restores the selection that was live before the change', () => {
    const editor = editorWith()
    editor.commands.select({ from: 2 as Pos, to: 5 as Pos })
    editor.commands.toggleBold()
    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })

    editor.commands.undo()
    expect(editor.selection.from).toBe(2)
    expect(editor.selection.to).toBe(5)
  })
})
