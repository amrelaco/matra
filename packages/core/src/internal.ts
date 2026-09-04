import type { Schema } from './engine/model'
import type { EditorState, Transaction } from './engine/state'
import type { Step } from './engine/transform'
import type { Ctx } from './types'

/**
 * Engine access for built-in extensions.
 *
 * Public commands only ever see `Ctx`. The bundled extensions sometimes need
 * the transaction itself — list splitting, for one — so the engine is reachable
 * from every ctx under a symbol: usable from inside this package, invisible in
 * the public types, and never part of semver.
 */
export interface EngineAccess {
  readonly state: EditorState
  /** The transaction being built. Started on first use, so asking is free. */
  readonly tr: Transaction
  readonly schema: Schema
  /**
   * True under `editor.can`, where nothing built here is applied.
   *
   * A command with a side effect outside the document — starting the
   * microphone — must not do it when it is only being asked whether it could.
   */
  readonly dry: boolean
  /** Rewind or replay one history entry. */
  replay(direction: 'undo' | 'redo'): boolean
  /** Rebuild a step that arrived as data — what collaboration needs. */
  stepFromJSON(json: Record<string, unknown>): Step | null
  /** An extension's own reduced state, mid-transaction. */
  pluginState(key: string): unknown
}

export const ENGINE: unique symbol = Symbol.for('matra.engine') as never

/**
 * Transaction meta that refuses to be merged into the previous undo entry.
 *
 * History groups by time, which is right for typing and wrong for a deliberate
 * structural change: restoring an old version of a document should not
 * disappear into the sentence somebody happened to be writing.
 */
export const ISOLATE = 'history:isolate'

/** Transaction meta set on an undo or a redo, so a filter can let history through. */
export const REPLAY = 'history:replay'

/** Transaction meta set by `setContent`, which replaces the document whatever is in it. */
export const REPLACE_ALL = 'matra:setContent'

export function engine(ctx: Ctx): EngineAccess {
  const access = (ctx as unknown as Record<symbol, EngineAccess>)[ENGINE]
  if (!access) throw new Error('Matra: ctx was created outside the engine')
  return access
}
