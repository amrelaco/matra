import type { AnyDef, Command, Ctx, Editor, ExtensionDef } from '@matrajs/core'
import type { CollabStep, Sendable } from './types'

export interface CollabOptions {
  /** Identifies this client. Two clients must never share one. */
  clientId: string
  /** The version this client starts from. */
  version?: number
}

/** A local step, kept with what it takes to rewind and rebase it. */
export interface PendingStep {
  step: EngineStep
  /** The step that undoes it, computed against the document it applied to. */
  inverted: EngineStep
  json: Record<string, unknown>
  clientId: string
}

export interface CollabState {
  version: number
  /** Local steps the authority has not confirmed yet. */
  unconfirmed: PendingStep[]
}

/** The slice of a step this package needs; the engine owns the real type. */
interface EngineStep {
  toJSON(): Record<string, unknown>
  invert(doc: unknown): EngineStep
  map(mapping: unknown): EngineStep | null
}

const REMOTE = 'collab:remote'
const CONFIRM = 'collab:confirm'
const REBASED = 'collab:rebased'

/**
 * Collaborative editing over a central authority.
 *
 * The protocol is the well-trodden one: a client sends the steps it has made
 * together with the version they applied to, and the authority accepts them
 * only if that version is still current. A client whose version is stale pulls
 * the steps it missed, rebases its own unconfirmed work over them, and tries
 * again.
 *
 * There is no CRDT here and no dependency. Rebasing already lives in the engine
 * — `Step.map` is what lets a local edit survive a remote one — so
 * collaboration is a version counter and a transport on top of it.
 */
export function collab(options: CollabOptions): ExtensionDef<
  {
    receiveCollabSteps: Command<[steps: CollabStep[]]>
    confirmCollabSteps: Command<[count: number]>
  },
  CollabState
> {
  const clientId = options.clientId
  if (!clientId) throw new Error('Matra: collab needs a clientId')

  return {
    kind: 'extension',
    name: 'collab',
    state: {
      init: () => ({ version: options.version ?? 0, unconfirmed: [] }),
      apply: (ctx, previous) => {
        const engine = readEngine(ctx)
        const tr = engine.tr

        const confirmed = tr.getMeta(CONFIRM)
        if (typeof confirmed === 'number') {
          return {
            version: previous.version + confirmed,
            unconfirmed: previous.unconfirmed.slice(confirmed),
          }
        }

        const rebased = tr.getMeta(REBASED) as
          | { remote: number; unconfirmed: PendingStep[] }
          | undefined
        if (rebased) {
          return {
            version: previous.version + rebased.remote,
            unconfirmed: rebased.unconfirmed,
          }
        }

        if (!tr.steps.length) return previous
        if (tr.getMeta(REMOTE)) return previous

        // Local work: keep each step with its inverse, which is what lets it be
        // rewound and replayed when someone else's edit arrives first.
        const pending: PendingStep[] = tr.steps.map((step, index) => ({
          step,
          inverted: step.invert(tr.docs[index]),
          json: step.toJSON(),
          clientId,
        }))
        return {
          version: previous.version,
          unconfirmed: [...previous.unconfirmed, ...pending],
        }
      },
    },
    commands: {
      /**
       * Apply steps from other clients.
       *
       * Steps this client sent are skipped — they are already in the document,
       * and applying them twice would duplicate the edit. A step that no longer
       * applies is dropped rather than throwing: one bad message from a peer
       * must not take the editor down.
       */
      receiveCollabSteps: (ctx, incoming) => {
        if (!incoming?.length) return false
        const engine = readEngine(ctx)
        const foreign = incoming.filter((entry) => entry.clientId !== clientId)
        if (!foreign.length) return false

        const pending =
          (engine.pluginState('collab') as CollabState | undefined)?.unconfirmed ?? []
        const tr = engine.tr

        // Rewind local work so the remote steps land on the document the
        // authority actually has. Applying them on top of unsent local edits
        // would leave both the document and the outgoing positions wrong.
        for (let i = pending.length - 1; i >= 0; i--) {
          tr.maybeStep(pending[i]?.inverted as never)
        }

        const beforeRemote = tr.steps.length
        let applied = 0
        for (const entry of foreign) {
          const step = engine.stepFromJSON(entry.step)
          if (step && tr.maybeStep(step)) applied++
        }
        if (!applied) return false

        // Replay local work over the remote changes.
        const remoteMapping = tr.mapping.slice(beforeRemote)
        const rebased: PendingStep[] = []
        for (const entry of pending) {
          const mapped = entry.step.map(remoteMapping)
          if (!mapped) continue
          const docBefore = tr.doc
          if (!tr.maybeStep(mapped as never)) continue
          rebased.push({
            step: mapped,
            inverted: mapped.invert(docBefore),
            json: mapped.toJSON(),
            clientId,
          })
        }

        tr.setMeta(REBASED, { remote: applied, unconfirmed: rebased })
        return true
      },

      /** The authority accepted this many of our steps; stop tracking them. */
      confirmCollabSteps: (ctx, count) => {
        if (!Number.isInteger(count) || count <= 0) return false
        readEngine(ctx).tr.setMeta(CONFIRM, count)
        return true
      },
    },
  }
}

/** Steps this client has made that the authority has not seen. */
export function sendableSteps(editor: Editor<readonly AnyDef[]>): Sendable | null {
  const state = editor.extensionState<CollabState>('collab')
  if (!state?.unconfirmed.length) return null
  return {
    version: state.version,
    steps: state.unconfirmed.map((entry) => ({ step: entry.json, clientId: entry.clientId })),
    clientId: state.unconfirmed[0]?.clientId ?? '',
  }
}

/** The version of the document this client believes it is on. */
export function getVersion(editor: Editor<readonly AnyDef[]>): number {
  return editor.extensionState<CollabState>('collab')?.version ?? 0
}

interface CollabEngine {
  tr: {
    steps: EngineStep[]
    docs: unknown[]
    doc: unknown
    mapping: { slice(from: number): unknown }
    getMeta(key: string): unknown
    setMeta(key: string, value: unknown): unknown
    maybeStep(step: unknown): boolean
  }
  stepFromJSON(json: Record<string, unknown>): EngineStep | null
  pluginState(key: string): unknown
}

/** Reach the engine the way bundled extensions do. */
function readEngine(ctx: Ctx): CollabEngine {
  const access = (ctx as unknown as Record<symbol, CollabEngine>)[Symbol.for('matra.engine')]
  if (!access) throw new Error('Matra: collab ctx was created outside the engine')
  return access
}
