import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import type { Schema } from '../model/schema'
import type { Plugin } from './plugin'
import { type Selection, TextSelection } from './selection'
import { Transaction } from './transaction'

export interface EditorStateConfig {
  schema: Schema
  doc?: Node
  selection?: Selection
  plugins?: Plugin[]
}

/**
 * Everything the editor knows at one moment.
 *
 * States are immutable: applying a transaction returns a new one, which is
 * what makes undo, collaboration and time travel tractable.
 */
export class EditorState {
  private constructor(
    readonly schema: Schema,
    readonly doc: Node,
    readonly selection: Selection,
    readonly storedMarks: readonly Mark[] | null,
    readonly plugins: readonly Plugin[],
    private readonly pluginValues: ReadonlyMap<string, unknown>,
  ) {}

  static create(config: EditorStateConfig): EditorState {
    const doc = config.doc ?? emptyDoc(config.schema)
    const selection = config.selection ?? TextSelection.atStart(doc)
    const plugins = config.plugins ?? []

    let state = new EditorState(config.schema, doc, selection, null, plugins, new Map())
    const values = new Map<string, unknown>()
    for (const plugin of plugins) {
      if (plugin.spec.state) values.set(plugin.key, plugin.spec.state.init(state))
    }
    state = new EditorState(config.schema, doc, selection, null, plugins, values)
    return state
  }

  /** Start a transaction against this state. */
  get tr(): Transaction {
    return new Transaction(this)
  }

  pluginState(key: string): unknown {
    return this.pluginValues.get(key)
  }

  /**
   * Apply a transaction, or refuse it if a plugin says no.
   *
   * Returns the same state when a filter vetoes, so callers can compare by
   * identity to know whether anything happened.
   */
  apply(tr: Transaction): EditorState {
    for (const plugin of this.plugins) {
      if (plugin.spec.filterTransaction?.(tr, this) === false) return this
    }

    const selection = tr.selectionSet
      ? tr.selection
      : tr.selection.map(tr.doc, tr.mapping.slice(0))
    const next = new EditorState(
      this.schema,
      tr.doc,
      selection,
      tr.storedMarksSet ? tr.storedMarks : null,
      this.plugins,
      this.pluginValues,
    )

    const values = new Map<string, unknown>()
    for (const plugin of this.plugins) {
      if (!plugin.spec.state) continue
      values.set(
        plugin.key,
        plugin.spec.state.apply(tr, this.pluginValues.get(plugin.key), next),
      )
    }

    return new EditorState(
      this.schema,
      tr.doc,
      selection,
      next.storedMarks,
      this.plugins,
      values,
    )
  }

  /** Marks the next typed character would carry. */
  get marks(): readonly Mark[] {
    return this.storedMarks ?? this.selection.$head.marks()
  }
}

function emptyDoc(schema: Schema): Node {
  const doc = schema.topNodeType.createAndFill()
  if (!doc) throw new Error('Matra: the schema cannot produce an empty document')
  return doc
}
