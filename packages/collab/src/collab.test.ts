import { createEditor, starterKit } from '@matrajs/core'
import type { Pos } from '@matrajs/core'
import { describe, expect, it } from 'vitest'
import { Authority } from './authority'
import { collab, getVersion, sendableSteps } from './collab'
import { type RemoteCursors, colorFor, remoteCursors } from './remote-cursors'

const makeClient = (clientId: string, content = '<p>hello world</p>') =>
  createEditor({
    extensions: [...starterKit, collab({ clientId })] as const,
    content,
  })

/** Push whatever a client has to the authority, reporting whether it stuck. */
const push = (editor: ReturnType<typeof makeClient>, authority: Authority) => {
  const sendable = sendableSteps(editor as never)
  if (!sendable) return true
  const accepted = authority.receive(sendable.version, sendable.steps)
  if (accepted) editor.commands.confirmCollabSteps(sendable.steps.length)
  return accepted
}

/** Pull everything the client has not seen and rebase onto it. */
const pull = (editor: ReturnType<typeof makeClient>, authority: Authority) => {
  const missing = authority.since(getVersion(editor as never))
  if (!missing.length) return
  editor.commands.receiveCollabSteps(missing)
}

describe('the authority', () => {
  it('accepts steps from a client that is up to date', () => {
    const authority = new Authority()
    expect(authority.receive(0, [{ step: { stepType: 'replace' }, clientId: 'a' }])).toBe(true)
    expect(authority.version).toBe(1)
  })

  it('refuses steps from a client that is behind', () => {
    const authority = new Authority()
    authority.receive(0, [{ step: {}, clientId: 'a' }])
    expect(authority.receive(0, [{ step: {}, clientId: 'b' }])).toBe(false)
  })

  it('reports what a client missed', () => {
    const authority = new Authority()
    authority.receive(0, [{ step: {}, clientId: 'a' }])
    authority.receive(1, [{ step: {}, clientId: 'b' }])
    expect(authority.since(0)).toHaveLength(2)
    expect(authority.since(1)).toHaveLength(1)
    expect(authority.since(2)).toHaveLength(0)
  })
})

describe('a single client', () => {
  it('queues its own steps as unconfirmed', () => {
    const editor = makeClient('a')
    expect(sendableSteps(editor as never)).toBeNull()

    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('X')

    const sendable = sendableSteps(editor as never)
    expect(sendable?.steps).toHaveLength(1)
    expect(sendable?.version).toBe(0)
  })

  it('stops tracking steps the authority confirmed', () => {
    const authority = new Authority()
    const editor = makeClient('a')

    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('X')
    expect(push(editor, authority)).toBe(true)

    expect(sendableSteps(editor as never)).toBeNull()
    expect(getVersion(editor as never)).toBe(1)
  })

  it('ignores its own steps coming back', () => {
    const authority = new Authority()
    const editor = makeClient('a')
    editor.commands.select({ from: 1 as Pos, to: 1 as Pos })
    editor.commands.insert('X')
    push(editor, authority)

    const before = editor.getText()
    editor.commands.receiveCollabSteps(authority.since(0))
    expect(editor.getText()).toBe(before)
  })
})

describe('two clients', () => {
  it('converges when edits do not overlap', () => {
    const authority = new Authority()
    const alice = makeClient('alice')
    const bob = makeClient('bob')

    // Alice types at the start.
    alice.commands.select({ from: 1 as Pos, to: 1 as Pos })
    alice.commands.insert('A')
    expect(push(alice, authority)).toBe(true)

    // Bob is behind, so his push is refused until he catches up.
    bob.commands.select({ from: 12 as Pos, to: 12 as Pos })
    bob.commands.insert('B')
    expect(push(bob, authority)).toBe(false)

    pull(bob, authority)
    expect(push(bob, authority)).toBe(true)

    pull(alice, authority)
    expect(alice.getText()).toBe(bob.getText())
    expect(alice.getText()).toBe('Ahello worldB')
  })

  it('converges when both edit the same paragraph', () => {
    const authority = new Authority()
    const alice = makeClient('alice')
    const bob = makeClient('bob')

    alice.commands.select({ from: 6 as Pos, to: 6 as Pos })
    alice.commands.insert('!')
    push(alice, authority)

    bob.commands.select({ from: 1 as Pos, to: 1 as Pos })
    bob.commands.insert('>')
    pull(bob, authority)
    push(bob, authority)

    pull(alice, authority)
    expect(alice.getText()).toBe(bob.getText())
  })

  it('keeps both edits when a deletion and an insertion race', () => {
    const authority = new Authority()
    const alice = makeClient('alice')
    const bob = makeClient('bob')

    alice.commands.select({ from: 1 as Pos, to: 6 as Pos })
    alice.commands.remove()
    push(alice, authority)

    bob.commands.select({ from: 12 as Pos, to: 12 as Pos })
    bob.commands.insert('!')
    pull(bob, authority)
    push(bob, authority)
    pull(alice, authority)

    expect(alice.getText()).toBe(bob.getText())
    expect(alice.getText()).toContain('!')
  })

  it('survives a peer sending nonsense', () => {
    const editor = makeClient('a')
    const before = editor.getText()
    expect(
      editor.commands.receiveCollabSteps([
        { step: { stepType: 'notAThing' }, clientId: 'peer' },
      ]),
    ).toBe(false)
    expect(editor.getText()).toBe(before)
  })
})

describe('remote cursors', () => {
  const client = (clientId: string, content = '<p>hello world</p>') =>
    createEditor({
      extensions: [...starterKit, collab({ clientId }), remoteCursors()] as const,
      content,
    })

  const cursors = (editor: ReturnType<typeof client>) =>
    editor.extensionState<RemoteCursors>('remoteCursors')

  it('tracks and removes people', () => {
    const editor = client('a')
    expect(editor.commands.setPresence({ clientId: 'bob', anchor: 3, head: 5 })).toBe(true)
    expect(cursors(editor)?.size).toBe(1)

    expect(editor.commands.removePresence('bob')).toBe(true)
    expect(cursors(editor)?.size).toBe(0)
  })

  it('moves a remote cursor forward when text is inserted before it', () => {
    const editor = client('a')
    editor.commands.setPresence({ clientId: 'bob', anchor: 9, head: 9 })

    editor.commands.select(1 as Pos)
    editor.commands.insert('12345')

    // Clamping — the shortcut this replaced — would have left bob at 9,
    // pointing five characters earlier in the text than where he was.
    const bob = cursors(editor)?.get('bob')
    expect(bob?.head).toBe(14)
    expect(bob?.anchor).toBe(14)
  })

  it('pulls a remote cursor back when text before it is deleted', () => {
    const editor = client('a')
    editor.commands.setPresence({ clientId: 'bob', anchor: 10, head: 10 })

    editor.commands.select({ from: 1 as Pos, to: 4 as Pos })
    editor.commands.remove()

    expect(cursors(editor)?.get('bob')?.head).toBe(7)
  })

  it('collapses a cursor that sat inside deleted text', () => {
    const editor = client('a')
    editor.commands.setPresence({ clientId: 'bob', anchor: 5, head: 5 })

    editor.commands.select({ from: 3 as Pos, to: 8 as Pos })
    editor.commands.remove()

    const head = cursors(editor)?.get('bob')?.head ?? -1
    expect(head).toBe(3)
  })

  it('refuses presence that is not placed in the document', () => {
    const editor = client('a')
    for (const bad of [
      { clientId: '', anchor: 1, head: 1 },
      { clientId: 'b', anchor: -1, head: 1 },
      { clientId: 'b', anchor: Number.NaN, head: 1 },
      { clientId: 'b', anchor: 1.5, head: 1 },
      { clientId: 'b', anchor: 1, head: Number.POSITIVE_INFINITY },
      null,
      undefined,
      'bob',
    ]) {
      expect(editor.commands.setPresence(bad as never)).toBe(false)
    }
    expect(cursors(editor)?.size).toBe(0)
  })

  it('clears everyone at once', () => {
    const editor = client('a')
    editor.commands.setPresence({ clientId: 'b', anchor: 1, head: 1 })
    editor.commands.setPresence({ clientId: 'c', anchor: 2, head: 2 })
    expect(cursors(editor)?.size).toBe(2)

    expect(editor.commands.clearPresence()).toBe(true)
    expect(cursors(editor)?.size).toBe(0)
  })

  it('gives the same person the same colour on every client', () => {
    expect(colorFor('bob')).toBe(colorFor('bob'))
    expect(colorFor('bob')).not.toBe(colorFor('alice'))
    expect(colorFor('bob')).toMatch(/^hsl\(\d+ 70% 45%\)$/)
  })
})
