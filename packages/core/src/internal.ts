import type { Schema } from './engine/model'
import type { EditorState, Transaction } from './engine/state'
import type { Step } from './engine/transform'
import type { Ctx } from './types'

/**
 * Engine access for built-in extensions.
 *
 * Public commands only ever see `Ctx`. The bundled extensions sometimes need
 * the transaction itself — list splitting, for one — so the engine is attached
 * to every ctx under a symbol: reachable from inside this package, invisible in
 * the public types, and never part of semver.
 */
export interface EngineAccess {
  readonly state: EditorState
  readonly tr: Transaction
  readonly schema: Schema
  /** Rewind or replay one history entry. */
  replay(direction: 'undo' | 'redo'): boolean
  /** Rebuild a step that arrived as data — what collaboration needs. */
  stepFromJSON(json: Record<string, unknown>): Step | null
  /** An extension's own reduced state, mid-transaction. */
  pluginState(key: string): unknown
}

const ENGINE = Symbol.for('matra.engine')

export function attachEngine(ctx: Ctx, access: EngineAccess): void {
  Object.defineProperty(ctx, ENGINE, { value: access, enumerable: false })
}

export function engine(ctx: Ctx): EngineAccess {
  const access = (ctx as unknown as Record<symbol, EngineAccess>)[ENGINE]
  if (!access) throw new Error('Matra: ctx was created outside the engine')
  return access
}
