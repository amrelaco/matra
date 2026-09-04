/**
 * The extensions that reach past the document: locked blocks and the change
 * filter behind them, template fields, ghost text, dictation, smart paste,
 * the two menus, and image resizing through a node view from outside.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEditor } from './editor'
import {
  bubbleMenu,
  dictation,
  dictationSupported,
  field,
  fieldsIn,
  fillFieldsIn,
  floatingMenu,
  ghostText,
  image,
  imageResize,
  locked,
  looksLikeMarkdown,
  parseDelimited,
  smartPaste,
  starterKit,
  tableKit,
} from './extensions'
import type { DocNode, Editor, Pos } from './types'

const mount = (editor: { mount(el: HTMLElement): void }) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  editor.mount(element)
  return element
}

const press = (element: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  element.dispatchEvent(event)
  return event.defaultPrevented
}

const paste = (element: HTMLElement, data: { html?: string; text?: string }) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/html' ? (data.html ?? '') : (data.text ?? '')),
      files: [],
    },
  })
  element.dispatchEvent(event)
  return event.defaultPrevented
}

const fireInput = (element: HTMLElement, inputType: string, data: string | null = null) => {
  const event = new Event('beforeinput', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'inputType', { value: inputType })
  Object.defineProperty(event, 'data', { value: data })
  Object.defineProperty(event, 'target', { value: element })
  element.dispatchEvent(event)
}

/** Put the DOM caret at the end of the last text node inside `selector`. */
const caretAtEndOf = (element: HTMLElement, selector: string) => {
  const blocks = element.querySelectorAll(selector)
  const block = blocks[blocks.length - 1] as HTMLElement
  let last: globalThis.Node = block
  while (last.lastChild) last = last.lastChild
  const range = document.createRange()
  const offset = last.nodeType === 3 ? (last.nodeValue ?? '').length : last.childNodes.length
  range.setStart(last, offset)
  range.collapse(true)
  const selection = document.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

const pos = (n: number) => n as Pos

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('locked', () => {
  const build = (content = '<p>fixed</p><p>free</p>') =>
    createEditor({ extensions: [...starterKit, locked()] as const, content })

  it('locks the block at the caret and renders the attribute', () => {
    const editor = build()
    editor.commands.select(pos(2))
    expect(editor.commands.lock()).toBe(true)
    expect(editor.getHTML()).toBe('<p data-locked="true">fixed</p><p>free</p>')
    expect(editor.isActive('paragraph', { locked: true })).toBe(true)
    expect(editor.extensionState<{ here: boolean }>('locked')?.here).toBe(true)
  })

  it('refuses every change that touches a locked block, and reports it', () => {
    const editor = build()
    editor.commands.select(pos(2))
    editor.commands.lock()
    expect(editor.commands.insert('x')).toBe(false)
    expect(editor.can.insert('x')).toBe(false)
    editor.commands.select({ from: pos(1), to: pos(4) })
    expect(editor.commands.toggleBold()).toBe(false)
    expect(editor.can.toggleBold()).toBe(false)
    expect(editor.commands.remove({ from: pos(1), to: pos(4) })).toBe(false)
    // A range that spans the locked block and beyond is refused as a whole.
    expect(editor.commands.remove({ from: pos(1), to: pos(10) })).toBe(false)
    expect(editor.getText()).toBe('fixed\nfree')
    // The undo history has nothing in it from any of that.
    expect(editor.commands.undo()).toBe(true) // the lock itself
    expect(editor.getHTML()).toBe('<p>fixed</p><p>free</p>')
  })

  it('leaves the rest of the document editable', () => {
    const editor = build()
    editor.commands.select(pos(2))
    editor.commands.lock()
    editor.commands.select(pos(12))
    expect(editor.commands.insert('!')).toBe(true)
    expect(editor.getText()).toBe('fixed\nfree!')
    // Inserting a block before the locked one moves it without touching it.
    editor.commands.select(pos(1))
    expect(
      editor.commands.insert({ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }),
    ).toBe(true)
    expect(editor.getHTML()).toContain('<p data-locked="true">fixed</p>')
  })

  it('unlocks, and the block is editable again', () => {
    const editor = build()
    editor.commands.select(pos(2))
    editor.commands.lock()
    expect(editor.commands.toggleLock()).toBe(true)
    expect(editor.isActive('paragraph', { locked: true })).toBe(false)
    expect(editor.commands.insert('x')).toBe(true)
    expect(editor.getText()).toBe('fxixed\nfree')
  })

  it('locks the outermost structure: the list, not the item', () => {
    const editor = build('<ul><li><p>one</p></li></ul>')
    editor.commands.select(pos(3))
    editor.commands.lock()
    expect(editor.getHTML()).toMatch(/^<ul data-locked="true">/)
    expect(editor.commands.insert('x')).toBe(false)
  })

  it('setContent replaces a document with locked blocks in it', () => {
    const editor = build()
    editor.commands.select(pos(2))
    editor.commands.lock()
    editor.setContent('<p>other</p>')
    expect(editor.getText()).toBe('other')
    editor.setContent('<p data-locked="true">loaded</p>')
    expect(editor.commands.insert('x')).toBe(false)
  })

  it('keeps typing through the view out of a locked block', () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.select(pos(2))
    editor.commands.lock()
    caretAtEndOf(element, 'p:first-child')
    fireInput(element, 'insertText', 'z')
    expect(editor.getText()).toBe('fixed\nfree')
    expect(element.querySelector('p')?.textContent).toBe('fixed')
    editor.destroy()
  })
})

describe('fields', () => {
  const build = (content: string | DocNode = '<p>Dear {{name}},</p>') =>
    createEditor({ extensions: [...starterKit, field] as const, content })

  it('parses, renders and inserts a field', () => {
    const editor = build()
    expect(editor.getJSON().content?.[0]?.content?.[0]).toEqual({
      type: 'text',
      text: 'Dear {{name}},',
    })
    editor.commands.select(pos(1))
    expect(editor.commands.insertField('greeting', 'Greeting')).toBe(true)
    expect(editor.getHTML()).toContain(
      '<span data-field="greeting" data-field-label="Greeting" class="matra-field">Greeting</span>',
    )
    expect(editor.commands.insertField('1bad')).toBe(false)
    expect(editor.commands.insertField('ok', 'x'.repeat(300))).toBe(false)
  })

  it('turns typed {{name}} into a field', () => {
    const editor = build('<p></p>')
    const element = mount(editor)
    for (const character of '{{first}}') {
      caretAtEndOf(element, 'p')
      fireInput(element, 'insertText', character)
    }
    expect(editor.getJSON().content?.[0]?.content?.[0]).toEqual({
      type: 'field',
      attrs: { name: 'first', label: null },
    })
    editor.destroy()
  })

  it('fills fields in the editor, keeping the marks the field carried', () => {
    const editor = build({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Dear ' },
            { type: 'field', attrs: { name: 'name' }, marks: [{ type: 'bold' }] },
            { type: 'text', text: ', re ' },
            { type: 'field', attrs: { name: 'topic' } },
          ],
        },
      ],
    })
    expect(editor.commands.fillFields({ name: 'Nahim' })).toBe(true)
    expect(editor.getHTML()).toBe(
      '<p>Dear <strong>Nahim</strong>, re <span data-field="topic" class="matra-field">{topic}</span></p>',
    )
    expect(editor.commands.fillFields({ topic: '' })).toBe(true)
    expect(editor.getText()).toBe('Dear Nahim, re ')
    expect(editor.commands.fillFields({ nobody: 'x' })).toBe(false)
  })

  it('fills with inline nodes and refuses blocks', () => {
    const editor = build({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'field', attrs: { name: 'x' } }] }],
    })
    expect(editor.commands.fillFields({ x: { type: 'paragraph' } })).toBe(false)
    expect(
      editor.commands.fillFields({
        x: [{ type: 'text', text: 'a', marks: [{ type: 'italic' }] }],
      }),
    ).toBe(true)
    expect(editor.getHTML()).toBe('<p><em>a</em></p>')
  })

  it('fills a document as JSON, with no editor', () => {
    const doc: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hi ' },
            { type: 'field', attrs: { name: 'name' } },
            { type: 'text', text: '!' },
          ],
        },
        { type: 'paragraph', content: [{ type: 'field', attrs: { name: 'later' } }] },
      ],
    }
    expect(fieldsIn(doc)).toEqual(['name', 'later'])
    const filled = fillFieldsIn(doc, { name: 'Ada' })
    expect(filled.content?.[0]?.content).toEqual([{ type: 'text', text: 'Hi Ada!' }])
    expect(filled.content?.[1]).toBe(doc.content?.[1])
    expect(doc.content?.[0]?.content).toHaveLength(3)
    expect(fieldsIn(filled)).toEqual(['later'])
  })
})

describe('ghost text', () => {
  const build = (
    suggest: (context: { before: string }) => string | null | Promise<string | null>,
  ) =>
    createEditor({
      extensions: [...starterKit, ghostText({ suggest, delay: 50 })] as const,
      content: '<p>Hel</p>',
    })

  it('asks after the caret rests, draws the answer, and Tab takes it', () => {
    vi.useFakeTimers()
    const editor = build(({ before }) => (before.endsWith('Hel') ? 'lo world' : null))
    const element = mount(editor)
    editor.commands.focus()
    editor.commands.select(pos(4))
    vi.advanceTimersByTime(50)
    expect(editor.extensionState<{ text: string | null }>('ghostText')?.text).toBe('lo world')
    expect(element.querySelector('.matra-ghost')?.textContent).toBe('lo world')
    expect(press(element, 'Tab')).toBe(true)
    expect(editor.getText()).toBe('Hello world')
    expect(element.querySelector('.matra-ghost')).toBeNull()
    editor.destroy()
  })

  it('takes one word at a time, and dismisses on Escape or any edit', () => {
    vi.useFakeTimers()
    const editor = build(() => 'lo there friend')
    const element = mount(editor)
    editor.commands.select(pos(4))
    vi.advanceTimersByTime(50)
    expect(editor.commands.acceptGhostWord()).toBe(true)
    expect(editor.getText()).toBe('Hello ')
    vi.advanceTimersByTime(50)
    expect(editor.extensionState<{ text: string | null }>('ghostText')?.text).toBe(
      'lo there friend',
    )
    expect(press(element, 'Escape')).toBe(true)
    expect(editor.extensionState<{ text: string | null }>('ghostText')?.text).toBeNull()
    expect(editor.commands.dismissGhostText()).toBe(false)
    vi.advanceTimersByTime(50)
    editor.commands.insert('x')
    expect(editor.extensionState<{ text: string | null }>('ghostText')?.text).toBeNull()
    editor.destroy()
  })

  it('drops an answer that arrives after the document moved on', async () => {
    vi.useFakeTimers()
    let resolve: (value: string) => void = () => undefined
    const editor = build(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    mount(editor)
    editor.commands.select(pos(4))
    vi.advanceTimersByTime(50)
    editor.commands.insert('p')
    resolve('stale')
    await Promise.resolve()
    expect(editor.extensionState<{ text: string | null }>('ghostText')?.text).toBeNull()
    editor.destroy()
  })
})

describe('dictation', () => {
  class FakeRecognition {
    static instances: FakeRecognition[] = []
    lang = ''
    continuous = false
    interimResults = false
    started = 0
    stopped = 0
    onresult: ((event: unknown) => void) | null = null
    onend: (() => void) | null = null
    onerror: ((event: { error?: string }) => void) | null = null
    constructor() {
      FakeRecognition.instances.push(this)
    }
    start() {
      this.started++
    }
    stop() {
      this.stopped++
      this.onend?.()
    }
    say(transcript: string, isFinal: boolean) {
      this.onresult?.({ resultIndex: 0, results: [{ isFinal, 0: { transcript }, length: 1 }] })
    }
  }
  const scope = globalThis as { SpeechRecognition?: unknown }

  afterEach(() => {
    scope.SpeechRecognition = undefined
    FakeRecognition.instances = []
  })

  it('returns false everywhere when the browser cannot listen', () => {
    expect(dictationSupported()).toBe(false)
    const editor = createEditor({ extensions: [...starterKit, dictation()] as const })
    mount(editor)
    expect(editor.can.startDictation()).toBe(false)
    expect(editor.commands.startDictation()).toBe(false)
    editor.destroy()
  })

  it('listens, shows interim words, and inserts final ones with a space', () => {
    scope.SpeechRecognition = FakeRecognition
    expect(dictationSupported()).toBe(true)
    const editor = createEditor({
      extensions: [...starterKit, dictation({ lang: 'en-GB' })] as const,
      content: '<p>Hello</p>',
    })
    const element = mount(editor)
    editor.commands.select(pos(6))
    expect(editor.can.startDictation()).toBe(true)
    expect(FakeRecognition.instances).toHaveLength(0)
    expect(editor.commands.startDictation()).toBe(true)
    const recognition = FakeRecognition.instances[0] as FakeRecognition
    expect(recognition.started).toBe(1)
    expect(recognition.lang).toBe('en-GB')
    expect(editor.extensionState<{ listening: boolean }>('dictation')?.listening).toBe(true)

    recognition.say('wor', false)
    expect(editor.extensionState<{ interim: string }>('dictation')?.interim).toBe('wor')
    expect(element.querySelector('.matra-dictation-interim')?.textContent).toBe(' wor')
    recognition.say('world', true)
    expect(editor.getText()).toBe('Hello world')
    expect(element.querySelector('.matra-dictation-interim')).toBeNull()

    expect(editor.commands.stopDictation()).toBe(true)
    expect(recognition.stopped).toBe(1)
    expect(editor.extensionState<{ listening: boolean }>('dictation')?.listening).toBe(false)
    expect(editor.commands.stopDictation()).toBe(false)
    editor.destroy()
  })

  it('toggles, and stops with the editor', () => {
    scope.SpeechRecognition = FakeRecognition
    const editor = createEditor({ extensions: [...starterKit, dictation()] as const })
    mount(editor)
    expect(editor.commands.toggleDictation()).toBe(true)
    expect(editor.commands.toggleDictation()).toBe(true)
    expect(FakeRecognition.instances[0]?.stopped).toBe(1)
    editor.commands.toggleDictation()
    editor.destroy()
    expect(FakeRecognition.instances[1]?.stopped).toBe(1)
  })
})

describe('smart paste', () => {
  const build = () =>
    createEditor({
      extensions: [...starterKit, ...tableKit, smartPaste()] as const,
      content: '<p>x</p>',
    })

  it('recognises grids and markdown', () => {
    expect(parseDelimited('a\tb\nc\td')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ])
    expect(parseDelimited('a,"b, c"\nd,e')).toEqual([
      ['a', 'b, c'],
      ['d', 'e'],
    ])
    expect(parseDelimited('one line')).toBeNull()
    expect(parseDelimited('a\tb\nc')).toBeNull()
    expect(
      parseDelimited(
        'Well, this is prose that goes on and on and on and on and on and on and on\nAnd, so is this line which also runs on and on and on and on and on and on',
      ),
    ).toBeNull()
    expect(looksLikeMarkdown('# Title\n\ntext')).toBe(true)
    expect(looksLikeMarkdown('plain words')).toBe(false)
    expect(looksLikeMarkdown('some **bold** words')).toBe(true)
  })

  it('pastes tab-separated text as a table', () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.select(pos(2))
    expect(paste(element, { text: 'Name\tAge\nAda\t36' })).toBe(true)
    expect(editor.getHTML()).toContain('<th><p>Name</p></th>')
    expect(editor.getHTML()).toContain('<td><p>36</p></td>')
    editor.destroy()
  })

  it('pastes markdown as blocks, and inline markdown inline', () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.select(pos(2))
    expect(paste(element, { text: '# Heading\n\n- one\n- two' })).toBe(true)
    expect(editor.getHTML()).toContain('<h1>Heading</h1>')
    expect(editor.getHTML()).toContain('<li><p>one</p></li>')
    editor.setContent('<p>x</p>')
    editor.commands.select(pos(2))
    expect(paste(element, { text: 'a **bold** word' })).toBe(true)
    expect(editor.getHTML()).toBe('<p>xa <strong>bold</strong> word</p>')
    editor.destroy()
  })

  it('leaves real HTML and plain prose to the editor', () => {
    const editor = build()
    const element = mount(editor)
    editor.commands.select(pos(2))
    expect(
      paste(element, { html: '<table><tr><td>a</td></tr></table>', text: 'a\tb\nc\td' }),
    ).toBe(true)
    expect(editor.getHTML()).not.toContain('<th>')
    expect(editor.getHTML()).toContain('<td><p>a</p></td>')
    editor.setContent('<p>x</p>')
    editor.commands.select(pos(2))
    paste(element, { text: 'just words' })
    expect(editor.getText()).toBe('xjust words')
    editor.destroy()
  })

  it('does not build what the editor cannot hold', () => {
    const editor = createEditor({
      extensions: [...starterKit, smartPaste()] as const,
      content: '<p>x</p>',
    })
    const element = mount(editor)
    editor.commands.select(pos(2))
    paste(element, { text: 'a\tb\nc\td' })
    expect(editor.getHTML()).not.toContain('<table')
    expect(editor.getText()).toBe('xa\tb\nc\td')
    editor.destroy()
  })
})

describe('menus', () => {
  const immediateFrames = () => {
    const raf = window.requestAnimationFrame
    window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof window.requestAnimationFrame
    return () => {
      window.requestAnimationFrame = raf
    }
  }

  it('shows the bubble menu over a selection and hides it when it collapses', () => {
    const restore = immediateFrames()
    const menu = document.createElement('div')
    document.body.appendChild(menu)
    const editor = createEditor({
      extensions: [...starterKit, bubbleMenu({ element: menu })] as const,
      content: '<p>hello world</p>',
    })
    mount(editor)
    expect(menu.hidden).toBe(true)
    editor.commands.focus()
    editor.commands.select({ from: pos(1), to: pos(6) })
    expect(menu.hidden).toBe(false)
    expect(menu.style.position).toBe('absolute')
    editor.commands.select(pos(6))
    expect(menu.hidden).toBe(true)
    editor.commands.select({ from: pos(1), to: pos(6) })
    editor.destroy()
    expect(menu.hidden).toBe(true)
    restore()
  })

  it('shows the floating menu only on an empty top-level line', () => {
    const restore = immediateFrames()
    const menu = document.createElement('div')
    document.body.appendChild(menu)
    const editor = createEditor({
      extensions: [...starterKit, floatingMenu({ element: menu })] as const,
      content: '<p>text</p><p></p>',
    })
    mount(editor)
    editor.commands.focus()
    editor.commands.select(pos(2))
    expect(menu.hidden).toBe(true)
    editor.commands.select(pos(7))
    expect(menu.hidden).toBe(false)
    editor.destroy()
    restore()
  })

  it('honours a custom shouldShow', () => {
    const restore = immediateFrames()
    const menu = document.createElement('div')
    document.body.appendChild(menu)
    const editor = createEditor({
      extensions: [
        ...starterKit,
        bubbleMenu({ element: menu, shouldShow: () => true }),
      ] as const,
      content: '<p>text</p>',
    })
    mount(editor)
    editor.commands.focus()
    editor.commands.select(pos(2))
    expect(menu.hidden).toBe(false)
    editor.destroy()
    restore()
  })
})

describe('image resize', () => {
  const build = (content: string) =>
    createEditor({ extensions: [...starterKit, image, imageResize()] as const, content })

  it('adds a width attribute the image did not have', () => {
    const editor = build('<p><img src="https://x.test/a.png" width="300"></p>')
    expect(editor.getJSON().content?.[0]?.content?.[0]?.attrs).toEqual({
      src: 'https://x.test/a.png',
      alt: null,
      title: null,
      width: 300,
    })
    expect(editor.commands.setImageWidth(200, pos(1))).toBe(true)
    expect(editor.getHTML()).toBe('<p><img src="https://x.test/a.png" width="200"></p>')
    expect(editor.commands.setImageWidth(200, pos(1))).toBe(false)
    expect(editor.commands.setImageWidth(10_000, pos(1))).toBe(true)
    expect(editor.getHTML()).toContain('width="4096"')
    expect(editor.commands.setImageWidth(null, pos(1))).toBe(true)
    expect(editor.getHTML()).toBe('<p><img src="https://x.test/a.png"></p>')
    expect(editor.commands.setImageWidth(50, pos(0))).toBe(false)
  })

  it('renders a handle and writes the dragged width back', () => {
    const editor = build('<p><img src="https://x.test/a.png"></p>')
    const element = mount(editor)
    const handle = element.querySelector('.matra-image-handle') as HTMLElement
    expect(handle).not.toBeNull()
    handle.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, bubbles: true }))
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60 }))
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 60 }))
    expect(editor.getJSON().content?.[0]?.content?.[0]?.attrs?.width).toBe(82)
    expect(element.querySelector('img')?.getAttribute('width')).toBe('82')
    editor.destroy()
  })
})

describe('the change filter', () => {
  it('leaves nothing behind when it refuses, and can says so', () => {
    const editor: Editor = createEditor({
      extensions: [
        ...starterKit,
        {
          kind: 'extension',
          name: 'noX',
          filterChange: (ctx) =>
            !ctx.doc.content?.some((b) => b.content?.some((t) => t.text?.includes('x'))),
        },
      ] as const,
      content: '<p>a</p>',
    })
    expect(editor.commands.insert('x')).toBe(false)
    expect(editor.can.insert('x')).toBe(false)
    expect(editor.commands.insert('y')).toBe(true)
    expect(editor.getText()).toBe('ya')
    expect((editor.commands as unknown as { undo(): boolean }).undo()).toBe(true)
    expect(editor.getText()).toBe('a')
    expect((editor.commands as unknown as { undo(): boolean }).undo()).toBe(false)
  })
})
