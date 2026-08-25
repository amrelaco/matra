/**
 * Composition — what happens when the keyboard is an IME.
 *
 * Bangla, Chinese, Japanese and Korean all compose: several keystrokes produce
 * one character, and while that is happening the browser writes provisional
 * text into the DOM itself and shows a candidate window. Re-rendering during
 * that window destroys it and loses the half-typed character, so the view
 * stands back and reads the result afterwards.
 *
 * These tests drive that path directly, because happy-dom has no IME and no
 * amount of typing in it will produce one. They are not a substitute for a real
 * device; they are the part that can be checked automatically.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { starterKit } from './extensions'
import type { Pos } from './types'

const mount = (content: string) => {
  const element = document.createElement('div')
  document.body.appendChild(element)
  const editor = createEditor({ extensions: starterKit, content })
  editor.mount(element)
  return { editor, element }
}

/** The text node the caret would be in. */
const firstText = (element: HTMLElement) =>
  element.querySelector('p')?.firstChild as Text | undefined

const fire = (element: HTMLElement, type: string) => {
  element.dispatchEvent(new Event(type, { bubbles: true }))
}

/**
 * Put the caret where the IME is writing.
 *
 * Not decoration: the view uses the selection to know which block composition
 * is happening in, so a test that skips this exercises only the fallback and
 * quietly proves nothing about the path real users take.
 */
const caretIn = (node: globalThis.Node, offset = 0) => {
  const selection = document.getSelection()
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection?.removeAllRanges()
  selection?.addRange(range)
}

/**
 * What an IME actually does: write into the DOM, then announce it finished.
 * The browser does the writing, which is exactly why the view cannot treat the
 * DOM as untouched afterwards.
 */
const compose = (element: HTMLElement, write: () => void, at?: globalThis.Node) => {
  if (at) caretIn(at)
  fire(element, 'compositionstart')
  write()
  fire(element, 'compositionend')
}

describe('composition', () => {
  it('takes the composed text into the document', () => {
    const { editor, element } = mount('<p>hello</p>')

    compose(
      element,
      () => {
        const text = firstText(element)
        if (text) text.nodeValue = 'helloক্ষ'
      },
      firstText(element),
    )

    expect(editor.getText()).toBe('helloক্ষ')
  })

  it('handles a conjunct built over several updates', () => {
    const { editor, element } = mount('<p></p>')

    fire(element, 'compositionstart')
    const paragraph = element.querySelector('p') as HTMLElement
    // ক then ক্ then ক্ষ — the shape the candidate window walks through.
    for (const stage of ['ক', 'ক্', 'ক্ষ']) {
      paragraph.textContent = stage
      fire(element, 'compositionupdate')
    }
    fire(element, 'compositionend')

    expect(editor.getText()).toBe('ক্ষ')
  })

  it('does not redraw while the candidate window is open', () => {
    const { editor, element } = mount('<p>base</p>')

    fire(element, 'compositionstart')
    const text = firstText(element)
    if (text) text.nodeValue = 'baseちゅ'

    // A change arriving mid-composition — a remote edit, an autosave reply —
    // must not rebuild the DOM under the candidate window.
    editor.commands.select(1 as Pos)

    expect(firstText(element)?.nodeValue).toBe('baseちゅ')

    fire(element, 'compositionend')
    expect(editor.getText()).toBe('baseちゅ')
  })

  it('survives a composition that replaces existing text', () => {
    const { editor, element } = mount('<p>かん</p>')

    compose(element, () => {
      const text = firstText(element)
      // Committing a candidate replaces the reading with the kanji.
      if (text) text.nodeValue = '漢'
    })

    expect(editor.getText()).toBe('漢')
  })

  it('leaves marks outside the composed text alone', () => {
    const { editor, element } = mount('<p><strong>bold</strong> plain</p>')

    compose(element, () => {
      const plain = element.querySelector('p')?.lastChild as Text | undefined
      if (plain) plain.nodeValue = ' plainন'
    })

    const marks = editor.getJSON().content?.[0]?.content?.[0]?.marks
    expect(marks?.[0]?.type).toBe('bold')
    expect(editor.getText()).toBe('bold plainন')
  })

  it('can be undone as one step', () => {
    const { editor, element } = mount('<p>start</p>')

    compose(element, () => {
      const text = firstText(element)
      if (text) text.nodeValue = 'startচ'
    })
    expect(editor.getText()).toBe('startচ')

    editor.commands.undo()
    expect(editor.getText()).toBe('start')
  })

  it('does not lose the document when composition produces nothing', () => {
    const { editor, element } = mount('<p>unchanged</p>')
    compose(element, () => {})
    expect(editor.getText()).toBe('unchanged')
  })
})

describe('composition cost', () => {
  /**
   * The whole document is re-parsed and replaced when a composition ends, so
   * the cost of typing one character scales with the size of the document —
   * but only for the people whose script needs an IME. This measures the gap
   * rather than asserting a number, because a threshold tuned on one machine
   * fails on another.
   */
  it('is measured against an ordinary keystroke, on the same document', () => {
    const build = (count: number) =>
      `<div>${Array.from({ length: count }, (_, i) => `<p>Paragraph ${i}</p>`).join('')}</div>`

    const { editor, element } = mount(build(400))
    const paragraph = element.querySelector('p') as HTMLElement

    const composeOnce = (n: number) => {
      caretIn(paragraph.firstChild ?? paragraph)
      fire(element, 'compositionstart')
      paragraph.textContent = `Paragraph 0${'ক'.repeat(n)}`
      fire(element, 'compositionend')
    }

    composeOnce(1)
    const imeStart = performance.now()
    for (let i = 2; i < 22; i++) composeOnce(i)
    const imePerCharacter = (performance.now() - imeStart) / 20

    editor.commands.select(1 as Pos)
    const plainStart = performance.now()
    for (let i = 0; i < 20; i++) {
      editor.commands.select(1 as Pos)
      editor.commands.insert('a')
    }
    const plainPerCharacter = (performance.now() - plainStart) / 20

    // Recorded rather than enforced: what matters is that the number is known
    // and in the open, not that it passes on this particular laptop.
    const ratio = imePerCharacter / plainPerCharacter
    console.info(
      `composition ${imePerCharacter.toFixed(3)} ms/char vs ordinary ${plainPerCharacter.toFixed(3)} ms/char — ${ratio.toFixed(1)}x`,
    )

    expect(editor.getText()).toContain('Paragraph 399')
  })
})
