import { createEditor, starterKit } from '@matrajs/core'
import type { Pos } from '@matrajs/core'
import { describe, expect, it } from 'vitest'
import { Authority } from './authority'
import { collab, getVersion, sendableSteps } from './collab'
import { PresenceTracker } from './presence'

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

describe('presence', () => {
  it('tracks and removes people', () => {
    const editor = makeClient('a')
    const tracker = new PresenceTracker(editor as never)

    tracker.set({ clientId: 'bob', anchor: 3, head: 5, meta: { name: 'Bob' } })
    expect(tracker.list()).toHaveLength(1)

    tracker.remove('bob')
    expect(tracker.list()).toHaveLength(0)
    tracker.destroy()
  })

  it('keeps a cursor inside the document as it shrinks', () => {
    const editor = makeClient('a')
    const tracker = new PresenceTracker(editor as never)
    tracker.set({ clientId: 'bob', anchor: 11, head: 11 })

    editor.commands.select({ from: 1 as Pos, to: 10 as Pos })
    editor.commands.remove()

    const bob = tracker.list()[0]
    expect(bob?.anchor).toBeLessThanOrEqual(editor.getText().length + 2)
    tracker.destroy()
  })
})
