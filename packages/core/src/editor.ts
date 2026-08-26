import { type CtxHost, createCtx } from './ctx'
import { History } from './engine/history'
import { InputRules, type TextContext } from './engine/input-rules'
import { Keymap } from './engine/keys'
import { DOMParser, DOMSerializer, Fragment, type Node, type Schema } from './engine/model'
import { EditorState, Plugin, TextSelection, type Transaction } from './engine/state'
import type { Mapping } from './engine/transform'
import {
  DecorationSet,
  EditorView,
  type NodeViewFactory as EngineNodeViewFactory,
} from './engine/view'
import { core } from './extensions/core'
import { buildSchema, sortByPriority } from './schema'
import type {
  AnyCommand,
  AnyDef,
  CommandsOf,
  CoreCommands,
  DecorationSpec,
  DocNode,
  Editor,
  EditorOptions,
  Pos,
  Selection,
} from './types'

type EventName = 'change' | 'focus' | 'blur' | 'selectionChange'

const asPos = (n: number) => n as Pos

export function createEditor<const T extends readonly AnyDef[]>(
  options: EditorOptions<T>,
): Editor<T> {
  const defs = sortByPriority([core, ...options.extensions] as readonly AnyDef[])
  const schema = buildSchema(defs)
  const mappings: Mapping[] = []
  const listeners = new Map<EventName, Set<(editor: Editor<T>) => void>>()
  const serializer = DOMSerializer.fromSchema(schema)
  const parser = DOMParser.fromSchema(schema)

  let view: EditorView | null = null

  const host: CtxHost = {
    schema,
    mappings,
    focus: () => view?.focus(),
    replay: (direction) => replay(direction),
  }

  // Extensions that declare state become engine plugins, reduced per transaction.
  const statefulDefs = defs.filter(
    (def): def is Extract<AnyDef, { kind: 'extension' }> =>
      def.kind === 'extension' && def.state !== undefined,
  )
  const plugins = statefulDefs.map((def) => {
    const spec = def.state
    if (!spec) throw new Error('Matra: stateful extension lost its state spec')
    return new Plugin({
      key: def.name,
      state: {
        init: (editorState) => spec.init(createCtx(host, editorState, editorState.tr)),
        apply: (tr, value, editorState) => spec.apply(createCtx(host, editorState, tr), value),
      },
    })
  })

  let state = EditorState.create({
    schema,
    doc: options.content ? parseContent(schema, parser, options.content) : undefined,
    plugins,
  })

  function emit(event: EventName) {
    for (const fn of listeners.get(event) ?? []) fn(editor)
  }

  /** Single funnel for every state change — view-mounted or headless. */
  function apply(tr: Transaction) {
    const selectionMoved = !tr.selection.eq(state.selection)
    const before = state.doc
    const selectionBefore = { anchor: state.selection.anchor, head: state.selection.head }
    if (tr.docChanged) history.record(tr, before, selectionBefore, Date.now())

    const next = state.apply(tr)
    // A plugin refusing the transaction returns the same state object.
    if (next === state && tr.docChanged) return

    state = next
    mappings.push(tr.mapping)
    view?.updateState(state, tr.mapping)
    if (tr.docChanged) emit('change')
    if (selectionMoved) emit('selectionChange')
  }

  /** Run a function against a fresh Ctx; dispatch only if it asked to keep changes. */
  function run(fn: (ctx: ReturnType<typeof createCtx>) => boolean): boolean {
    const tr = state.tr
    const ctx = createCtx(host, state, tr)

    let ok = false
    try {
      ok = fn(ctx)
    } catch (error) {
      // A command is contracted to report success as a boolean. One that
      // throws — a bad extension, a hostile step, an edge nobody covered —
      // must not take the whole editor down with it, and the half-built
      // transaction is discarded rather than applied.
      console.error('Matra: a command threw and was refused', error)
      return false
    }
    if (!ok) return false
    // Metadata counts: a transaction that only carries meta is how an
    // extension tells its own reducer something happened.
    if (tr.docChanged || tr.selectionSet || tr.storedMarksSet || tr.metaSet) apply(tr)
    return true
  }

  // --- command surface ------------------------------------------------------

  function collectCommands(): Record<string, AnyCommand> {
    const out: Record<string, AnyCommand> = {}
    for (const def of defs) {
      if (!def.commands) continue
      for (const [name, command] of Object.entries(def.commands)) {
        if (out[name]) {
          throw new Error(`Matra: two extensions both define the command "${name}"`)
        }
        out[name] = command as AnyCommand
      }
    }
    return out
  }

  const rawCommands = collectCommands()

  function bind(target: Record<string, AnyCommand>) {
    const bound: Record<string, (...args: unknown[]) => boolean> = {}
    for (const [name, command] of Object.entries(target)) {
      bound[name] = (...args: unknown[]) => run((ctx) => command(ctx, ...args))
    }
    return bound as CommandsOf<T> & CoreCommands
  }

  const commands = bind(rawCommands)

  // --- keymap, input rules and history ---------------------------------------

  const history = new History()
  const keys = new Keymap()
  for (const def of defs) {
    if (!def.keys) continue
    for (const [combo, target] of Object.entries(def.keys)) {
      const command =
        typeof target === 'function' ? (target as AnyCommand) : rawCommands[target as string]
      if (!command) continue
      keys.add(combo, () => run((ctx) => command(ctx)))
    }
  }
  keys.add('Mod-z', () => replay('undo'))
  keys.add('Mod-y', () => replay('redo'))
  keys.add('Shift-Mod-z', () => replay('redo'))

  const rules = new InputRules(defs.flatMap((def) => def.inputRules ?? []))

  /** Rewind or replay one history entry as a single transaction. */
  function replay(direction: 'undo' | 'redo'): boolean {
    const entry = history.take(direction)
    if (!entry) return false
    const tr = state.tr
    for (const step of entry.steps) tr.step(step)
    tr.setSelection(TextSelection.create(tr.doc, entry.selection.anchor, entry.selection.head))
    apply(tr)
    history.finish()
    return true
  }

  /** Text before the caret inside the current block, for input-rule matching. */
  function textContext(): TextContext {
    const { $from, from, to } = state.selection
    const start = $from.start()
    return {
      before: state.doc.textBetween(start, from, '\n'),
      start: asPos(start),
      from: asPos(from),
      to: asPos(to),
    }
  }

  function handleTextInput(typed: string): boolean {
    if (!rules.size) return false
    return rules.handle(textContext(), typed, (rule, match, range) => {
      let handled = false
      run((ctx) => {
        handled = rule.handler(ctx, match, range)
        return handled
      })
      return handled
    })
  }

  /**
   * Move a whole block, as a drop does.
   *
   * One transaction, so it is one undo step: dragging a paragraph and pressing
   * Mod-Z should put it back, not half back.
   */
  /** Ask every extension what it wants drawn, right now. */
  function collectDecorations(): DecorationSet {
    const specs: DecorationSpec[] = []
    for (const def of defs) {
      if (def.kind !== 'extension' || !def.decorations) continue
      const ctx = createCtx(host, state, state.tr)
      try {
        specs.push(...def.decorations(ctx))
      } catch (error) {
        // A broken decorator must not take the editor down with it.
        console.error(`Matra: decorations from "${def.name}" threw`, error)
      }
    }
    return DecorationSet.create(specs as never)
  }

  // --- public surface -------------------------------------------------------

  const editor: Editor<T> = {
    commands,

    batch(runner) {
      const tr = state.tr
      const ctx = createCtx(host, state, tr)
      let failed = false
      const staged: Record<string, (...args: unknown[]) => boolean> = {}
      for (const [name, command] of Object.entries(rawCommands)) {
        staged[name] = (...args: unknown[]) => {
          if (failed) return false
          const ok = command(ctx, ...args)
          if (!ok) failed = true
          return ok
        }
      }
      runner(staged as CommandsOf<T> & CoreCommands)
      if (failed) return false
      if (tr.docChanged || tr.selectionSet || tr.storedMarksSet || tr.metaSet) apply(tr)
      return true
    },

    extensionState: <S = unknown>(name: string) => state.pluginState(name) as S | undefined,

    getJSON: () => state.doc.toJSON() as unknown as DocNode,

    getHTML: () => serializer.serializeHTML(state.doc.content),

    getText: () => state.doc.textBetween(0, state.doc.content.size, '\n'),

    setContent(content) {
      const tr = state.tr
      const parsed = parseContent(schema, parser, content)
      tr.replaceWith(0, state.doc.content.size, parsed.content)
      apply(tr)
    },

    get selection(): Selection {
      const sel = state.selection
      return {
        from: asPos(sel.from),
        to: asPos(sel.to),
        anchor: asPos(sel.anchor),
        head: asPos(sel.head),
        empty: sel.empty,
      }
    },

    get editable() {
      return options.editable ?? true
    },

    setEditable(value) {
      options.editable = value
      view?.setEditable(value)
    },

    on(event, fn) {
      const set = listeners.get(event) ?? new Set()
      set.add(fn as (editor: Editor<T>) => void)
      listeners.set(event, set)
      return () => set.delete(fn as (editor: Editor<T>) => void)
    },

    mount(element) {
      if (view) throw new Error('Matra: editor is already mounted')
      // Node views are written against plain JSON, like everything else in the
      // public API, so the engine's node is converted on the way in.
      const nodeViews: Record<string, EngineNodeViewFactory> = {}
      for (const def of defs) {
        if (def.kind !== 'node' || !def.nodeView) continue
        const factory = def.nodeView
        nodeViews[def.name] = ({ node, getPos }) => {
          const spec = factory({
            node: node.toJSON() as unknown as DocNode,
            getPos,
            editor: editor as Editor,
          })
          return {
            dom: spec.dom,
            contentDOM: spec.contentDOM,
            update: spec.update
              ? (next) => Boolean(spec.update?.(next.toJSON() as unknown as DocNode))
              : undefined,
            destroy: spec.destroy,
            stopEvent: spec.stopEvent,
          }
        }
      }

      view = new EditorView(element, schema, {
        state,
        nodeViews,
        decorations: () => collectDecorations(),
        editable: () => options.editable ?? true,
        dispatchTransaction: (tr) => apply(tr),
        handleKeyDown: (event) => keys.handle(event),
        moveBlock: (from, to) => commands.moveBlock(from as Pos, to as Pos),
        handlers: {
          onTextInput: (text) => handleTextInput(text),
        },
      })
      element.addEventListener('focus', () => emit('focus'))
      element.addEventListener('blur', () => emit('blur'))
      for (const def of defs) def.kind === 'extension' && def.onCreate?.(editor)
      if (options.autofocus) view.focus()
    },

    destroy() {
      for (const def of defs) def.kind === 'extension' && def.onDestroy?.(editor)
      view?.destroy()
      view = null
      listeners.clear()
    },

    unsafe: {
      get view() {
        return view
      },
      get state() {
        return state
      },
      get schema() {
        return schema
      },
    },
  }

  editor.on('change', () => {
    for (const def of defs) def.kind === 'extension' && def.onChange?.(editor)
  })

  return editor
}

function parseContent(schema: Schema, parser: DOMParser, content: DocNode | string): Node {
  if (typeof content !== 'string') return schema.nodeFromJSON(content)
  const container = document.createElement('div')
  container.innerHTML = content
  return parser.parse(container)
}

export { Fragment }
