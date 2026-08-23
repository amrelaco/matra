import { createEditor, starterKit } from 'matra'
import type { Pos } from 'matra'
import { describe, expect, it, vi } from 'vitest'
import { ai } from './extension'
import type { AiSession, AiStream } from './types'

/** A model that emits the given chunks, pausing between each. */
const streamOf = (chunks: string[]): AiStream =>
  async function* () {
    for (const chunk of chunks) {
      await Promise.resolve()
      yield chunk
    }
  }

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}

function setup(stream: AiStream, onStatus?: (s: AiSession) => void) {
  const extension = ai({ stream, onStatus })
  const editor = createEditor({
    extensions: [...starterKit, extension] as const,
    content: '<p>the quick brown fox</p>',
  })
  // onCreate normally fires on mount; the tests run headless.
  editor.mount(document.createElement('div'))
  return editor
}

describe('@matra/ai', () => {
  it('streams a replacement into the selected range', async () => {
    const editor = setup(streamOf(['nim', 'ble']))
    editor.commands.select({ from: 5 as Pos, to: 10 as Pos })
    expect(editor.commands.askAi('shorten')).toBe(true)
    await flush()
    expect(editor.getText()).toBe('the nimble brown fox')
  })

  it('lands correctly even when the user types during the stream', async () => {
    const editor = setup(streamOf(['nim', 'ble']))
    editor.commands.select({ from: 5 as Pos, to: 10 as Pos })
    editor.commands.askAi('shorten')

    // The user types at the very start while the model is mid-sentence.
    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('WAIT ')

    await flush()
    expect(editor.getText()).toBe('WAIT the nimble brown fox')
  })

  it('refuses to start on an empty selection', () => {
    const editor = setup(streamOf(['x']))
    editor.commands.select({ from: 3 as Pos, to: 3 as Pos })
    expect(editor.commands.askAi('anything')).toBe(false)
  })

  it('refuses a second request while one is streaming', async () => {
    const editor = setup(streamOf(['a', 'b', 'c']))
    editor.commands.select({ from: 5 as Pos, to: 10 as Pos })
    expect(editor.commands.askAi('one')).toBe(true)
    expect(editor.commands.askAi('two')).toBe(false)
    await flush()
  })

  it('stops applying chunks after cancel', async () => {
    const editor = setup(streamOf(['nim', 'ble', ' and quick']))
    editor.commands.select({ from: 5 as Pos, to: 10 as Pos })
    editor.commands.askAi('shorten')
    await Promise.resolve()
    await Promise.resolve()
    editor.commands.cancelAi()
    const afterCancel = editor.getText()
    await flush()
    expect(editor.getText()).toBe(afterCancel)
    expect(editor.getText()).not.toContain('and quick')
  })

  it('reports status transitions', async () => {
    const seen: string[] = []
    const editor = setup(streamOf(['ok']), (s) => seen.push(s.status))
    editor.commands.select({ from: 5 as Pos, to: 10 as Pos })
    editor.commands.askAi('shorten')
    await flush()
    expect(seen[0]).toBe('streaming')
    expect(seen.at(-1)).toBe('done')
  })

  it('surfaces a model failure as an error status', async () => {
    const failing: AiStream = async function* () {
      yield 'partial'
      throw new Error('model exploded')
    }
    const onStatus = vi.fn()
    const editor = setup(failing, onStatus)
    editor.commands.select({ from: 5 as Pos, to: 10 as Pos })
    editor.commands.askAi('shorten')
    await flush()
    const last = onStatus.mock.calls.at(-1)?.[0] as AiSession
    expect(last.status).toBe('error')
    expect(last.error?.message).toBe('model exploded')
  })
})
