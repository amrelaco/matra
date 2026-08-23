import type { EditorState } from './state'
import type { Transaction } from './transaction'

/**
 * A plugin adds state that lives alongside the document.
 *
 * `init` builds the starting value; `apply` folds each transaction into it.
 * Plugin state is reduced, not mutated, so time travel and undo keep working.
 */
export interface PluginSpec<S = unknown> {
  key: string
  state?: {
    init(state: EditorState): S
    apply(tr: Transaction, value: S, state: EditorState): S
  }
  /** Veto a transaction before it is applied. */
  filterTransaction?(tr: Transaction, state: EditorState): boolean
}

export class Plugin<S = unknown> {
  constructor(readonly spec: PluginSpec<S>) {}

  get key(): string {
    return this.spec.key
  }

  /** This plugin's slice of the given state. */
  getState(state: EditorState): S | undefined {
    return state.pluginState(this.key) as S | undefined
  }
}
