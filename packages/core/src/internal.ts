import type { EditorState, Transaction } from './engine/state'
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
  /** Rewind or replay one history entry. */
  replay(direction: 'undo' | 'redo'): boolean
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
