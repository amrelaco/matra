/**
 * Four extensions for the act of writing: the selected word's other
 * occurrences, text direction, typewriter scrolling and autosave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import { type AutosaveOptions, type AutosaveState, autosave } from './extensions/autosave'
import { selectionHighlight } from './extensions/selection-highlight'
import { textDirection } from './extensions/text-direction'
import { type TypewriterState, typewriter } from './extensions/typewriter'
import type { Pos } from './types'

const mount = (editor: { mount(el: HTMLElement): void }) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

describe('selection highlight', () => {
  const MATCH = '.matra-selection-match'
  const build = (content: string, options?: Parameters<typeof selectionHighlight>[0]) =>
    createEditor({ extensions: [...starterKit, selectionHighlight(options)] as const, content })

  it('draws every other occurrence of the selected word, and not the selection', () => {
    const editor = build('<p>cat and cat and cat</p>')
    const element = mount(editor)
    editor.commands.select({ from: 9 as Pos, to: 12 as Pos })
    expect(element.querySelectorAll(MATCH)).toHaveLength(2)
    expect(element.querySelector('p')?.innerHTML).toBe(
      '<span class="matra-selection-match">cat</span> and cat and <span class="matra-selection-match">cat</span>',
    )
    // Drawn over the document, not written into it.
    expect(editor.getHTML()).toBe('<p>cat and cat and cat</p>')
  })

  it('ignores a selection with a space in it, and a single character', () => {
    const editor = build('<p>cat and cat and cat</p>')
    const element = mount(editor)
    editor.commands.select({ from: 1 as Pos, to: 8 as Pos })
    expect(element.querySelectorAll(MATCH)).toHaveLength(0)
    editor.commands.select({ from: 1 as Pos, to: 2 as Pos })
    expect(element.querySelectorAll(MATCH)).toHaveLength(0)
  })

  it('matches regardless of case unless told otherwise', () => {
    const loose = build('<p>Cat cat CAT</p>')
    const looseElement = mount(loose)
    loose.commands.select({ from: 1 as Pos, to: 4 as Pos })
    expect(looseElement.querySelectorAll(MATCH)).toHaveLength(2)

    const strict = build('<p>Cat cat CAT</p>', { caseSensitive: true })
    const strictElement = mount(strict)
    strict.commands.select({ from: 1 as Pos, to: 4 as Pos })
    expect(strictElement.querySelectorAll(MATCH)).toHaveLength(0)
  })

  it('leaves cats alone when cat is selected and whole words are wanted', () => {
    const loose = build('<p>cat cats cat</p>')
    const looseElement = mount(loose)
    loose.commands.select({ from: 1 as Pos, to: 4 as Pos })
    expect(looseElement.querySelectorAll(MATCH)).toHaveLength(2)

    const whole = build('<p>cat cats cat</p>', { wholeWord: true })
    const wholeElement = mount(whole)
    whole.commands.select({ from: 1 as Pos, to: 4 as Pos })
    const spans = wholeElement.querySelectorAll(MATCH)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.textContent).toBe('cat')
  })

  it('lands on the word inside a list item', () => {
    const editor = build('<p>cat dog</p><ul><li><p>a cat sat</p></li></ul>')
    const element = mount(editor)
    editor.commands.select({ from: 1 as Pos, to: 4 as Pos })
    const spans = element.querySelectorAll(MATCH)
    expect(spans).toHaveLength(1)
    expect(spans[0]?.textContent).toBe('cat')
    expect(spans[0]?.closest('li')).not.toBeNull()
  })

  it('follows the text as it changes, and stops at the limit', () => {
    const editor = build('<p>ab ab ab ab ab</p>', { max: 2 })
    const element = mount(editor)
    editor.commands.select({ from: 1 as Pos, to: 3 as Pos })
    expect(element.querySelectorAll(MATCH)).toHaveLength(2)
    editor.commands.replace({ from: 4 as Pos, to: 6 as Pos }, 'xy')
    editor.commands.select({ from: 1 as Pos, to: 3 as Pos })
    expect(element.querySelectorAll(MATCH)).toHaveLength(2)
    editor.commands.select({ from: 4 as Pos, to: 6 as Pos })
    expect(element.querySelectorAll(MATCH)).toHaveLength(0)
  })
})

describe('text direction', () => {
  const build = (content: string, options?: Parameters<typeof textDirection>[0]) =>
    createEditor({ extensions: [...starterKit, textDirection(options)] as const, content })

  it('draws a right-to-left block that way, and leaves English alone', () => {
    const editor = build('<p>مرحبا بالعالم</p><p>hello</p><h1>שלום</h1>')
    const element = mount(editor)
    const [arabic, english] = Array.from(element.querySelectorAll('p'))
    expect(arabic?.getAttribute('dir')).toBe('rtl')
    expect(english?.hasAttribute('dir')).toBe(false)
    expect(element.querySelector('h1')?.getAttribute('dir')).toBe('rtl')
    // Detected, not stored.
    expect(editor.getHTML()).not.toContain('dir=')
  })

  it('steps over digits and punctuation to the first letter', () => {
    const editor = build('<p>123. שלום</p><p>42 apples</p>')
    const element = mount(editor)
    const [hebrew, english] = Array.from(element.querySelectorAll('p'))
    expect(hebrew?.getAttribute('dir')).toBe('rtl')
    expect(english?.hasAttribute('dir')).toBe(false)
  })

  it('lets an explicit direction win, and detects again once it is unset', () => {
    const editor = build('<p>مرحبا</p>')
    const element = mount(editor)
    editor.commands.select(2 as Pos)
    expect(editor.commands.setTextDirection('ltr')).toBe(true)
    expect(element.querySelector('p')?.getAttribute('dir')).toBe('ltr')
    expect(editor.getHTML()).toBe('<p dir="ltr">مرحبا</p>')
    expect(editor.commands.setTextDirection('ltr')).toBe(false)

    expect(editor.commands.unsetTextDirection()).toBe(true)
    expect(editor.getHTML()).toBe('<p>مرحبا</p>')
    expect(element.querySelector('p')?.getAttribute('dir')).toBe('rtl')
    expect(editor.commands.unsetTextDirection()).toBe(false)
    expect(editor.commands.setTextDirection('up' as never)).toBe(false)
  })

  it('round-trips dir through HTML', () => {
    const editor = build('<p dir="rtl">hello</p><p dir="auto">there</p>')
    expect(editor.getHTML()).toBe('<p dir="rtl">hello</p><p>there</p>')
    expect(editor.getJSON().content?.[0]?.attrs?.dir).toBe('rtl')
  })

  it('detects nothing when told not to', () => {
    const editor = build('<p>שלום</p>', { auto: false })
    const element = mount(editor)
    expect(element.querySelector('p')?.hasAttribute('dir')).toBe(false)
  })

  it('follows the text as it is typed', () => {
    const editor = build('<p>hello</p>')
    const element = mount(editor)
    editor.commands.select({ from: 1 as Pos, to: 6 as Pos })
    editor.commands.insert('שלום')
    expect(element.querySelector('p')?.getAttribute('dir')).toBe('rtl')
    editor.commands.select({ from: 1 as Pos, to: 5 as Pos })
    editor.commands.insert('hi')
    expect(element.querySelector('p')?.hasAttribute('dir')).toBe(false)
  })
})

describe('typewriter', () => {
  const frames: FrameRequestCallback[] = []
  const flush = () => {
    for (const frame of frames.splice(0)) frame(0)
  }
  let scrollBy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    frames.length = 0
    scrollBy = vi.fn()
    Object.defineProperty(window, 'scrollBy', {
      value: scrollBy,
      configurable: true,
      writable: true,
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) => frames.push(frame))
    vi.spyOn(window.Range.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 300,
      height: 20,
    } as DOMRect)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** A focused editor with the caret at the end, and the frame that put it there spent. */
  const build = (options?: Parameters<typeof typewriter>[0]) => {
    const editor = createEditor({
      extensions: [...starterKit, typewriter(options)] as const,
      content: '<p>hello</p>',
    })
    const element = mount(editor)
    editor.commands.focus()
    editor.commands.select(6 as Pos)
    flush()
    scrollBy.mockClear()
    return { editor, element }
  }

  it('scrolls the caret line to the middle after typing, one frame per burst', () => {
    const { editor } = build()
    editor.commands.insert('!')
    // A change and a caret move, one frame.
    expect(frames).toHaveLength(1)
    flush()
    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollBy).toHaveBeenCalledWith({
      top: 310 - window.innerHeight / 2,
      behavior: 'auto',
    })
  })

  it('honours position and smooth', () => {
    const { editor } = build({ position: 0, smooth: true })
    editor.commands.insert('!')
    flush()
    expect(scrollBy).toHaveBeenCalledWith({ top: 310, behavior: 'smooth' })
  })

  it('measures the block when the caret has no height of its own', () => {
    vi.spyOn(window.Range.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      height: 0,
    } as DOMRect)
    vi.spyOn(window.HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: 500,
      height: 24,
    } as DOMRect)
    const { editor } = build()
    editor.commands.insert('!')
    flush()
    expect(scrollBy).toHaveBeenCalledWith({
      top: 512 - window.innerHeight / 2,
      behavior: 'auto',
    })
  })

  it('stops when disabled, and starts again', () => {
    const { editor } = build()
    expect(editor.commands.disableTypewriter()).toBe(true)
    expect(editor.commands.disableTypewriter()).toBe(false)
    expect(editor.extensionState<TypewriterState>('typewriter')?.enabled).toBe(false)
    editor.commands.insert('!')
    flush()
    expect(scrollBy).not.toHaveBeenCalled()

    expect(editor.commands.toggleTypewriter()).toBe(true)
    editor.commands.insert('!')
    flush()
    expect(scrollBy).toHaveBeenCalledTimes(1)
  })

  it('leaves the page alone while the editor is not focused', () => {
    const { editor, element } = build()
    element.blur()
    editor.commands.insert('!')
    flush()
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('stops once unmounted, even with a frame already booked', () => {
    const { editor } = build()
    editor.commands.insert('!')
    editor.destroy()
    flush()
    editor.commands.insert('?')
    flush()
    expect(scrollBy).not.toHaveBeenCalled()
  })

  it('scrolls a custom scroller by the distance to its middle', () => {
    const box = document.createElement('div')
    const boxScroll = vi.fn()
    Object.defineProperty(box, 'scrollBy', { value: boxScroll })
    Object.defineProperty(box, 'clientHeight', { value: 400 })
    box.getBoundingClientRect = () => ({ top: 100, height: 400 }) as DOMRect
    const { editor } = build({ scroller: () => box })
    editor.commands.insert('!')
    flush()
    expect(boxScroll).toHaveBeenCalledWith({ top: 10, behavior: 'auto' })
    expect(scrollBy).not.toHaveBeenCalled()
  })
})

describe('autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const state = (editor: { extensionState<S>(name: string): S | undefined }) =>
    editor.extensionState<AutosaveState>('autosave') as AutosaveState

  const build = (options: Partial<AutosaveOptions> = {}) => {
    const save = options.save ?? vi.fn()
    const editor = createEditor({
      extensions: [...starterKit, autosave({ ...options, save })] as const,
      content: '<p>draft</p>',
    })
    mount(editor)
    return { editor, save }
  }

  const type = (editor: ReturnType<typeof build>['editor'], text: string) => {
    editor.commands.select(6 as Pos)
    editor.commands.insert(text)
  }

  it('saves once typing has paused, with the document as JSON', () => {
    const { editor, save } = build({ delay: 500 })
    expect(state(editor)).toEqual({ dirty: false, saving: false, savedAt: null, error: null })
    type(editor, '!')
    expect(state(editor).dirty).toBe(true)
    vi.advanceTimersByTime(499)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(editor.getJSON(), editor)
    expect(state(editor)).toEqual({
      dirty: false,
      saving: false,
      savedAt: Date.now(),
      error: null,
    })
  })

  it('saves once for a burst of changes', () => {
    const { editor, save } = build()
    type(editor, 'a')
    vi.advanceTimersByTime(600)
    type(editor, 'b')
    vi.advanceTimersByTime(600)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    expect(save).toHaveBeenCalledTimes(1)
    expect(editor.getText()).toBe('draftba')
  })

  it('saves now on command, and drops the pending timer', async () => {
    const { editor, save } = build()
    type(editor, '!')
    // Asking is not saving.
    expect(editor.can.save()).toBe(true)
    expect(save).not.toHaveBeenCalled()

    expect(editor.commands.save()).toBe(true)
    expect(state(editor).saving).toBe(true)
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)
    expect(state(editor)).toMatchObject({ dirty: false, saving: false })
    vi.advanceTimersByTime(5000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('loads what restore returns without marking it dirty', () => {
    const { editor, save } = build({ restore: () => '<p>restored</p>' })
    expect(editor.getText()).toBe('restored')
    expect(state(editor).dirty).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(save).not.toHaveBeenCalled()
  })

  it('reports a save that fails, keeps the document dirty, and tries again on the next change', async () => {
    const failure = new Error('offline')
    const onError = vi.fn()
    const save = vi.fn().mockRejectedValueOnce(failure)
    const { editor } = build({ save, onError })
    type(editor, '!')
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)
    expect(state(editor)).toMatchObject({ dirty: true, saving: false, error: failure })
    expect(onError).toHaveBeenCalledWith(failure)
    // Not retried on its own.
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).toHaveBeenCalledTimes(1)

    type(editor, '?')
    await vi.advanceTimersByTimeAsync(1000)
    expect(save).toHaveBeenCalledTimes(2)
    expect(state(editor)).toMatchObject({ dirty: false, error: null })
  })

  it('stays dirty when the document changes during a save, and saves again', async () => {
    let finish: () => void = () => {}
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const { editor } = build({ save })
    type(editor, '!')
    vi.advanceTimersByTime(1000)
    expect(state(editor).saving).toBe(true)
    type(editor, '?')
    finish()
    await Promise.resolve()
    expect(state(editor)).toMatchObject({ dirty: true, saving: false })
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('saves whatever is pending when the page is hidden, and when destroyed', () => {
    const { editor, save } = build()
    type(editor, '!')
    window.dispatchEvent(new Event('pagehide'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(state(editor).dirty).toBe(false)

    type(editor, '?')
    editor.destroy()
    expect(save).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(5000)
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('can be told to leave a hidden page alone', () => {
    const { editor, save } = build({ flushOnHide: false })
    type(editor, '!')
    window.dispatchEvent(new Event('pagehide'))
    expect(save).not.toHaveBeenCalled()
  })

  it('has nothing to save before it is mounted', () => {
    const save = vi.fn()
    const editor = createEditor({
      extensions: [...starterKit, autosave({ save })] as const,
      content: '<p>x</p>',
    })
    expect(editor.commands.save()).toBe(false)
  })
})
