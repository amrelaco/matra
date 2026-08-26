/**
 * Version history, and the diff underneath it.
 *
 * The diff is the part worth testing hardest: it is the only piece here that
 * can be confidently wrong. A snapshot list that drops an entry is obvious the
 * moment you look at it; a diff that reports a moved paragraph as one deletion
 * and one insertion looks perfectly reasonable and is useless.
 */
import { createEditor, starterKit } from '@matrajs/core'
import { describe, expect, it } from 'vitest'
import { diffDocs, diffWords, sizeOf, textOf } from './diff'
import { versions } from './versions'

const para = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const doc = (...texts: string[]) => ({ type: 'doc', content: texts.map(para) })

/** A clock the test owns, so two versions never share a millisecond by luck. */
const clock = () => {
  let at = 1_700_000_000_000
  return () => (at += 1000)
}

const editorWith = (content: ReturnType<typeof doc>, now = clock()) =>
  createEditor({
    extensions: [...starterKit, versions({ now, idleMs: null })],
    content: content as never,
  })

describe('the word diff', () => {
  it('keeps what stayed and marks what did not', () => {
    const runs = diffWords('the quick brown fox', 'the slow brown fox')
    expect(runs.filter((run) => run.kind === 'removed').map((run) => run.text)).toEqual([
      'quick',
    ])
    expect(runs.filter((run) => run.kind === 'added').map((run) => run.text)).toEqual(['slow'])
  })

  it('rejoins to the original text on each side', () => {
    const before = 'one two three four five'
    const after = 'one three four six five'
    const runs = diffWords(before, after)
    const rebuiltBefore = runs
      .filter((run) => run.kind !== 'added')
      .map((run) => run.text)
      .join('')
    const rebuiltAfter = runs
      .filter((run) => run.kind !== 'removed')
      .map((run) => run.text)
      .join('')
    expect(rebuiltBefore).toBe(before)
    expect(rebuiltAfter).toBe(after)
  })

  it('says nothing changed when nothing did', () => {
    expect(diffWords('same words', 'same words').every((run) => run.kind === 'same')).toBe(true)
  })
})

describe('the block diff', () => {
  it('finds one added paragraph among many', () => {
    const before = doc('alpha', 'beta', 'gamma')
    const after = doc('alpha', 'beta', 'inserted', 'gamma')
    const diff = diffDocs(before as never, after as never)

    expect(diff.added).toBe(1)
    expect(diff.removed).toBe(0)
    expect(diff.changed).toBe(0)
    expect(diff.blocks.find((block) => block.kind === 'added')?.text).toBe('inserted')
  })

  it('reads a rewritten paragraph as one change, not two', () => {
    const before = doc('alpha', 'the quick brown fox', 'gamma')
    const after = doc('alpha', 'the slow brown fox', 'gamma')
    const diff = diffDocs(before as never, after as never)

    expect(diff.changed).toBe(1)
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
    const change = diff.blocks.find((block) => block.kind === 'changed')
    expect(
      change?.words?.some((run) => run.kind === 'added' && run.text.includes('slow')),
    ).toBe(true)
  })

  it('treats a paragraph that moved as the same paragraph', () => {
    const before = doc('one', 'two', 'three')
    const after = doc('two', 'three', 'one')
    const diff = diffDocs(before as never, after as never)

    // 'two' and 'three' keep their identity; only 'one' had to move.
    expect(
      diff.blocks.filter((block) => block.kind === 'same').map((block) => block.text),
    ).toEqual(['two', 'three'])
    expect(diff.added + diff.removed + diff.changed).toBe(2)
  })

  it('is empty for a document that did not change', () => {
    const diff = diffDocs(doc('a', 'b') as never, doc('a', 'b') as never)
    expect(diff.same).toBe(true)
    expect(diff.blocks.every((block) => block.kind === 'same')).toBe(true)
  })

  it('does not fall over on a completely rewritten document', () => {
    const before = doc(...Array.from({ length: 600 }, (_, i) => `before ${i}`))
    const after = doc(...Array.from({ length: 600 }, (_, i) => `after ${i}`))
    const diff = diffDocs(before as never, after as never)
    expect(diff.same).toBe(false)
    expect(diff.blocks.length).toBeGreaterThan(0)
  })
})

describe('sizes', () => {
  it('measures a document the way positions do', () => {
    // paragraph = open + text + close
    expect(sizeOf(para('hello') as never)).toBe(7)
    expect(sizeOf(doc('hello') as never)).toBe(9)
    expect(sizeOf(doc('a', 'b') as never)).toBe(8)
  })

  it('reads the text out of a nested node', () => {
    expect(textOf(doc('one', 'two') as never)).toBe('onetwo')
  })
})

describe('the extension', () => {
  it('takes one on open and refuses a duplicate', () => {
    const editor = editorWith(doc('hello'))
    expect(editor.extensionState<{ versions: unknown[] }>('versions')?.versions.length).toBe(1)

    expect(editor.commands.snapshotVersion('again')).toBe(false)
    expect(editor.extensionState<{ versions: unknown[] }>('versions')?.versions.length).toBe(1)
  })

  it('takes another once the document moves', () => {
    const editor = editorWith(doc('hello'))
    editor.commands.select(1 as never)
    editor.commands.insert('x')

    expect(editor.commands.snapshotVersion('after typing')).toBe(true)
    const state = editor.extensionState<{ versions: { label: string }[] }>('versions')
    expect(state?.versions.map((entry) => entry.label)).toEqual(['Opened', 'after typing'])
  })

  it('previews a version and diffs it against the document now', () => {
    const editor = editorWith(doc('alpha', 'beta'))
    const first = editor.extensionState<{ versions: { id: number }[] }>('versions')?.versions[0]
    expect(first).toBeDefined()

    editor.commands.select(1 as never)
    editor.commands.insert('X')
    expect(editor.commands.previewVersion(first?.id as number)).toBe(true)

    const state = editor.extensionState<{ diff: { changed: number } | null }>('versions')
    expect(state?.diff?.changed).toBe(1)
  })

  it('refuses to preview a version that is not there', () => {
    const editor = editorWith(doc('alpha'))
    expect(editor.commands.previewVersion(999)).toBe(false)
  })

  it('restores a version, and keeps where you were', () => {
    const editor = editorWith(doc('original text'))
    const first = editor.extensionState<{ versions: { id: number }[] }>('versions')?.versions[0]

    editor.commands.select(1 as never)
    editor.commands.insert('CHANGED ')
    expect(editor.getText()).toContain('CHANGED')

    expect(editor.commands.restoreVersion(first?.id as number)).toBe(true)
    expect(editor.getText()).toBe('original text')

    const labels = editor
      .extensionState<{ versions: { label: string }[] }>('versions')
      ?.versions.map((entry) => entry.label)
    expect(labels).toContain('Before restore')
  })

  it('undoes a restore in one press', () => {
    const editor = editorWith(doc('original'))
    const first = editor.extensionState<{ versions: { id: number }[] }>('versions')?.versions[0]

    editor.commands.select(1 as never)
    editor.commands.insert('new ')
    const typed = editor.getText()

    editor.commands.restoreVersion(first?.id as number)
    expect(editor.getText()).toBe('original')

    editor.commands.undo()
    expect(editor.getText()).toBe(typed)
  })

  it('forgets one, and stops previewing it', () => {
    const editor = editorWith(doc('alpha'))
    const first = editor.extensionState<{ versions: { id: number }[] }>('versions')?.versions[0]
    const id = first?.id as number

    editor.commands.select(1 as never)
    editor.commands.insert('X')
    editor.commands.previewVersion(id)
    expect(editor.commands.forgetVersion(id)).toBe(true)

    const state = editor.extensionState<{ previewing: number | null; versions: unknown[] }>(
      'versions',
    )
    expect(state?.previewing).toBe(null)
    expect(state?.versions.length).toBe(0)
    expect(editor.commands.forgetVersion(id)).toBe(false)
  })

  it('keeps the first version and the newest ones when trimming', () => {
    const now = clock()
    const editor = createEditor({
      extensions: [...starterKit, versions({ now, idleMs: null, keep: 3 })],
      content: doc('start') as never,
    })

    for (let i = 0; i < 6; i++) {
      editor.commands.select(1 as never)
      editor.commands.insert(String(i))
      editor.commands.snapshotVersion(`v${i}`)
    }

    const labels = editor
      .extensionState<{ versions: { label: string }[] }>('versions')
      ?.versions.map((entry) => entry.label)
    expect(labels?.length).toBe(3)
    expect(labels?.[0]).toBe('Opened')
    expect(labels?.[labels.length - 1]).toBe('v5')
  })
})
