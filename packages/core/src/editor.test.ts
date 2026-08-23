import { describe, expect, it, vi } from 'vitest'
import { createEditor } from './editor'
import { bold, document as doc, paragraph, text } from './extensions'
import type { Command, ExtensionDef, Pos, PosMarker, Range } from './types'

const base = [doc, paragraph, text, bold] as const

const editorWith = (content = '<p>hello world</p>') =>
  createEditor({ extensions: base, content })

describe('createEditor', () => {
  it('builds a schema and round-trips content', () => {
    const editor = editorWith()
    expect(editor.getText()).toBe('hello world')
    expect(editor.getJSON().type).toBe('doc')
    expect(editor.getHTML()).toBe('<p>hello world</p>')
  })

  it('rejects a definition set without doc or text', () => {
    expect(() => createEditor({ extensions: [paragraph] as const })).toThrow(/no "doc" node/)
  })

  it('rejects two extensions claiming the same command name', () => {
    const clash = { ...bold, name: 'strong' }
    expect(() =>
      createEditor({ extensions: [doc, paragraph, text, bold, clash] as const }),
    ).toThrow(/both define the command/)
  })
})

describe('commands', () => {
  it('toggles a mark across a selection and reports it back', () => {
    const editor = editorWith()
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    expect(editor.commands.toggleBold()).toBe(true)
    expect(editor.getHTML()).toContain('<strong>hello</strong>')

    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.toggleBold()
    expect(editor.getHTML()).not.toContain('<strong>')
  })

  it('emits change only when the document actually changes', () => {
    const editor = editorWith()
    const onChange = vi.fn()
    editor.on('change', onChange)

    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    expect(onChange).not.toHaveBeenCalled()

    editor.commands.toggleBold()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('rolls a batch back entirely when one command fails', () => {
    const editor = editorWith()
    const before = editor.getJSON()
    const ok = editor.batch((c) => {
      c.select({ from: 1 as Pos, to: 6 as Pos })
      c.toggleBold()
      c.select({ from: 9999 as Pos, to: 9999 as Pos })
    })
    expect(ok).toBe(false)
    expect(editor.getJSON()).toEqual(before)
  })
})

describe('async position mapping', () => {
  // A miniature of the real AI extension: capture a range, come back later.
  let pending: { marker: PosMarker; range: Range } | null = null

  const beginRewrite: Command = (ctx) => {
    pending = { marker: ctx.mark(), range: { from: ctx.selection.from, to: ctx.selection.to } }
    return true
  }
  const applyRewrite: Command<[string]> = (ctx, replacement) => {
    if (!pending) return false
    return ctx.replace(pending.marker.mapRange(pending.range), replacement)
  }

  const ai: ExtensionDef<{ beginRewrite: Command; applyRewrite: Command<[string]> }> = {
    kind: 'extension',
    name: 'ai',
    commands: { beginRewrite, applyRewrite },
  }

  it('lands a late answer on the words the user meant', async () => {
    const editor = createEditor({
      extensions: [doc, paragraph, text, bold, ai] as const,
      content: '<p>the quick brown fox</p>',
    })
    pending = null

    // Select "quick" and start the request.
    editor.commands.select({ from: 5 as Pos, to: 10 as Pos })
    editor.commands.beginRewrite()

    // The user keeps typing at the top while the model is thinking.
    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('WAIT ')
    await Promise.resolve()

    // The answer arrives against stale coordinates — and still lands right.
    expect(editor.commands.applyRewrite('nimble')).toBe(true)
    expect(editor.getText()).toBe('WAIT the nimble brown fox')
  })

  it('without mapping, the same edit corrupts the document', () => {
    const editor = createEditor({
      extensions: [doc, paragraph, text, bold, ai] as const,
      content: '<p>the quick brown fox</p>',
    })
    const stale: Range = { from: 5 as Pos, to: 10 as Pos }

    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('WAIT ')

    // Applying the captured range verbatim is exactly the bug Matra prevents.
    editor.commands.replace(stale, 'nimble')
    expect(editor.getText()).not.toBe('WAIT the nimble brown fox')
    expect(editor.getText()).toBe('WAITnimblequick brown fox')
  })
})
