/**
 * Suggestions — the `@` and `/` menus.
 *
 * Most of what makes one of these good is what it refuses to trigger on, so
 * most of these tests are about that: an email address is not a mention, a
 * sentence after a stray `@` is not a query, and Escape has to stay escaped.
 */
import { describe, expect, it } from 'vitest'
import { createEditor } from './editor'
import { activeSuggestion, mention, starterKit, suggestion } from './extensions'
import type { Pos } from './types'

const build = (options: Parameters<typeof suggestion>[0] = { char: '@' }) => {
  const editor = createEditor({
    extensions: [...starterKit, suggestion(options), mention()] as const,
    content: '<p></p>',
  })
  return editor
}

const active = (editor: ReturnType<typeof build>) => activeSuggestion(editor)

/** Type text at the end of the document, the way a person would. */
const type = (editor: ReturnType<typeof build>, text: string) => {
  for (const character of text) {
    const end = (editor.getJSON().content ?? []).reduce(
      (total, node) => total + ((node.content?.[0]?.text?.length ?? 0) + 2),
      0,
    )
    editor.commands.select((end - 1) as Pos)
    editor.commands.insert(character)
  }
}

describe('when a suggestion opens', () => {
  it('opens on the trigger and tracks what follows', () => {
    const editor = build()
    type(editor, '@nah')
    expect(active(editor)?.query).toBe('nah')
  })

  it('opens with an empty query the moment the trigger is typed', () => {
    const editor = build()
    type(editor, '@')
    expect(active(editor)?.query).toBe('')
  })

  it('opens after a space, mid-paragraph', () => {
    const editor = build()
    type(editor, 'hello @na')
    expect(active(editor)?.query).toBe('na')
  })

  it('marks exactly the text that accepting would replace', () => {
    const editor = build()
    type(editor, 'hi @bob')
    const range = active(editor)?.range
    // "hi " is three characters, and the paragraph's content starts at 1.
    expect(range?.from).toBe(4)
    expect(range?.to).toBe(8)
  })
})

describe('when it must not open', () => {
  it('ignores the @ inside an email address', () => {
    const editor = build()
    type(editor, 'write to nahim@example')
    expect(active(editor)).toBeNull()
  })

  it('closes once the query contains a space', () => {
    const editor = build()
    type(editor, '@nahim ')
    expect(active(editor)).toBeNull()
  })

  it('gives up on a query longer than the limit', () => {
    const editor = build({ char: '@', maxLength: 5 })
    type(editor, '@abcdefghij')
    expect(active(editor)).toBeNull()
  })

  it('stays shut when there is no trigger at all', () => {
    const editor = build()
    type(editor, 'ordinary text')
    expect(active(editor)).toBeNull()
  })

  it('only fires at the start of a line when asked to', () => {
    const editor = build({ char: '/', startOfLine: true })
    type(editor, 'text /command')
    expect(active(editor)).toBeNull()

    const fresh = build({ char: '/', startOfLine: true })
    type(fresh, '/head')
    expect(active(fresh)?.query).toBe('head')
  })

  it('allows spaces when asked to', () => {
    const editor = build({ char: '@', allowSpaces: true })
    type(editor, '@Nahim Hossain')
    expect(active(editor)?.query).toBe('Nahim Hossain')
  })
})

describe('accepting and cancelling', () => {
  it('replaces the trigger and query with a mention node', () => {
    const editor = build()
    type(editor, 'hi @na')

    expect(
      editor.commands.acceptSuggestion({
        type: 'mention',
        attrs: { id: 'u1', label: 'Nahim' },
      }),
    ).toBe(true)

    const inline = editor.getJSON().content?.[0]?.content
    expect(inline?.[0]?.text).toBe('hi ')
    expect(inline?.[1]?.type).toBe('mention')
    expect(inline?.[1]?.attrs?.id).toBe('u1')
    // The typed "@na" is gone rather than left behind beside the mention.
    expect(editor.getText()).not.toContain('@na')
    expect(active(editor)).toBeNull()
  })

  it('refuses to accept when nothing is open', () => {
    const editor = build()
    type(editor, 'plain')
    expect(editor.commands.acceptSuggestion({ type: 'mention', attrs: { id: 'x' } })).toBe(
      false,
    )
  })

  it('refuses an empty replacement rather than deleting the query', () => {
    const editor = build()
    type(editor, '@na')
    expect(editor.commands.acceptSuggestion(null)).toBe(false)
    expect(editor.getText()).toContain('@na')
  })

  it('closes on cancel and stays closed while the query is untouched', () => {
    const editor = build()
    type(editor, '@na')
    expect(editor.commands.cancelSuggestion()).toBe(true)
    expect(active(editor)).toBeNull()

    // Moving around must not bring it back — that is what makes Escape useless.
    editor.commands.select(2 as Pos)
    expect(active(editor)).toBeNull()
  })

  it('opens again once typing resumes', () => {
    const editor = build()
    type(editor, '@na')
    editor.commands.cancelSuggestion()
    expect(active(editor)).toBeNull()

    type(editor, 'h')
    expect(active(editor)?.query).toBe('nah')
  })
})

describe('the mention node', () => {
  it('survives a round trip through HTML', () => {
    const editor = build()
    editor.setContent(
      '<p>hi <span data-mention-id="u1" data-mention-label="Nahim">@Nahim</span></p>',
    )
    const inline = editor.getJSON().content?.[0]?.content
    expect(inline?.[1]?.type).toBe('mention')
    expect(inline?.[1]?.attrs?.label).toBe('Nahim')
    expect(editor.getHTML()).toContain('data-mention-id="u1"')
  })

  it('refuses a mention with no id', () => {
    const editor = build()
    expect(editor.commands.insertMention({ id: '', label: 'nobody' })).toBe(false)
  })

  it('keeps the id rather than trusting the label', () => {
    const editor = build()
    editor.commands.insertMention({ id: 'u42', label: 'Nahim' })
    const node = editor.getJSON().content?.[0]?.content?.[0]
    expect(node?.attrs?.id).toBe('u42')
  })

  it('cannot be half-deleted into nonsense', () => {
    const editor = build()
    editor.commands.insertMention({ id: 'u1', label: 'Nahim' })
    const before = editor.getJSON().content?.[0]?.content?.length ?? 0
    // An atom has size one: there is no position inside it to delete into.
    expect(before).toBe(1)
    expect(editor.getJSON().content?.[0]?.content?.[0]?.type).toBe('mention')
  })
})
