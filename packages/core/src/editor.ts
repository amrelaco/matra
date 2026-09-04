import { type CommandContext, type CtxHost, type Marker, createCtx } from './ctx'
import { History } from './engine/history'
import { InputRules, type TextContext } from './engine/input-rules'
import { Keymap } from './engine/keys'
import { DOMParser, Fragment, HTMLSerializer, type Node, type Schema } from './engine/model'
import { EditorState, Plugin, TextSelection, type Transaction } from './engine/state'
import type { Mapping, Step } from './engine/transform'
import {
  DecorationSet,
  EditorView,
  type NodeViewFactory as EngineNodeViewFactory,
} from './engine/view'
import { core } from './extensions/core'
import { ISOLATE, REPLACE_ALL, REPLAY } from './internal'
import { buildSchema, sortByPriority } from './schema'
import type {
  AnyCommand,
  AnyDef,
  CommandsOf,
  CoreCommands,
  DecorationSpec,
  DocNode,
  DropData,
  Editor,
  EditorOptions,
  ExtensionDef,
  NodeViewFactory,
  PasteData,
  Pos,
  Selection,
} from './types'

type EventName = 'change' | 'focus' | 'blur' | 'selectionChange'

const asPos = (n: number) => n as Pos

/**
 * Everything about an editor that depends only on its extensions.
 *
 * Two editors built from the same array share all of it. A page with an
 * editor per comment, or a React tree that mounts and unmounts the same
 * component, used to compile the schema — every content expression to an
 * automaton, every parse rule, every command — once per editor. Keyed on the
 * array itself and checked element by element, so a mutated array recompiles
 * rather than serving the schema it used to describe.
 */
interface Compiled {
  source: readonly AnyDef[]
  defs: readonly AnyDef[]
  schema: Schema
  parser: DOMParser
  htmlSerializer: HTMLSerializer
  rawCommands: Record<string, AnyCommand>
  bindings: Array<[combo: string, command: AnyCommand]>
  rules: InputRules
  stateful: ExtensionDef[]
  decorators: ExtensionDef[]
  pasteHandlers: ExtensionDef[]
  dropHandlers: ExtensionDef[]
  lifecycle: ExtensionDef[]
  filters: ExtensionDef[]
  nodeViews: Record<string, NodeViewFactory>
}

const compiled = new WeakMap<readonly AnyDef[], Compiled>()

function compile(extensions: readonly AnyDef[]): Compiled {
  const hit = compiled.get(extensions)
  if (
    hit &&
    hit.source.length === extensions.length &&
    hit.source.every((def, i) => def === extensions[i])
  ) {
    return hit
  }

  const defs = sortByPriority([core, ...extensions] as readonly AnyDef[])
  const schema = buildSchema(defs)

  const rawCommands: Record<string, AnyCommand> = {}
  for (const def of defs) {
    if (!def.commands) continue
    for (const [name, command] of Object.entries(def.commands)) {
      if (rawCommands[name]) {
        throw new Error(`Matra: two extensions both define the command "${name}"`)
      }
      rawCommands[name] = command as AnyCommand
    }
  }

  const bindings: Compiled['bindings'] = []
  for (const def of defs) {
    if (!def.keys) continue
    for (const [combo, target] of Object.entries(def.keys)) {
      const command =
        typeof target === 'function' ? (target as AnyCommand) : rawCommands[target as string]
      if (command) bindings.push([combo, command])
    }
  }

  const extensionsOnly = defs.filter((def): def is ExtensionDef => def.kind === 'extension')

  // A node's own view first, then whatever an extension says about it: the
  // extension is the one that knows the node needs handles.
  const nodeViews: Record<string, NodeViewFactory> = {}
  for (const def of defs) {
    if (def.kind === 'node' && def.nodeView) nodeViews[def.name] = def.nodeView
  }
  for (const def of extensionsOnly) {
    if (!def.nodeViews) continue
    for (const [name, factory] of Object.entries(def.nodeViews)) nodeViews[name] = factory
  }

  const result: Compiled = {
    source: [...extensions],
    defs,
    schema,
    parser: DOMParser.fromSchema(schema),
    // getHTML answers without touching the DOM, so a document stored as JSON
    // can be rendered on a server or at the edge. The two serializers are held
    // to the same output by a test.
    htmlSerializer: HTMLSerializer.fromSchema(schema),
    rawCommands,
    bindings,
    rules: new InputRules(defs.flatMap((def) => def.inputRules ?? [])),
    stateful: extensionsOnly.filter((def) => def.state !== undefined),
    decorators: extensionsOnly.filter((def) => def.decorations !== undefined),
    pasteHandlers: extensionsOnly.filter((def) => def.handlePaste !== undefined),
    dropHandlers: extensionsOnly.filter((def) => def.handleDrop !== undefined),
    lifecycle: extensionsOnly.filter(
      (def) =>
        def.onCreate !== undefined || def.onChange !== undefined || def.onDestroy !== undefined,
    ),
    filters: extensionsOnly.filter((def) => def.filterChange !== undefined),
    nodeViews,
  }
  compiled.set(extensions, result)
  return result
}

/** Mappings are swept for markers nobody holds any more this often. */
const SWEEP_EVERY = 256

type WeakMarker = { deref(): Marker | undefined }
const WeakRefCtor = (globalThis as { WeakRef?: new (target: Marker) => WeakMarker }).WeakRef

export function createEditor<const T extends readonly AnyDef[]>(
  options: EditorOptions<T>,
): Editor<T> {
  const {
    defs,
    schema,
    parser,
    htmlSerializer,
    rawCommands,
    bindings,
    rules,
    stateful,
    decorators,
    pasteHandlers,
    dropHandlers,
    lifecycle,
    filters,
    nodeViews: nodeViewFactories,
  } = compile(options.extensions)

  /**
   * The mappings a position marker may still need.
   *
   * Every change appends one, and a marker taken at version `v` maps through
   * everything from `v` on. Kept forever, that is a list that grows with every
   * keystroke of the session. So markers are held weakly, and every so often
   * the mappings older than the oldest marker still alive are dropped —
   * `base` records how many went, so a version number stays meaningful.
   * Without weak references nothing is dropped, which is only what it was.
   */
  const mappings: Mapping[] = []
  let base = 0
  const markers = new Set<WeakMarker>()

  function remember(mapping: Mapping): void {
    mappings.push(mapping)
    if (!WeakRefCtor || mappings.length % SWEEP_EVERY !== 0) return
    let oldest = base + mappings.length
    for (const ref of markers) {
      const marker = ref.deref()
      if (!marker) markers.delete(ref)
      else if (marker.version < oldest) oldest = marker.version
    }
    const drop = oldest - base
    if (drop > 0) {
      mappings.splice(0, drop)
      base += drop
    }
  }

  const listeners = new Map<EventName, Set<(editor: Editor<T>) => void>>()

  let view: EditorView | null = null

  const host: CtxHost = {
    schema,
    mappings,
    get base() {
      return base
    },
    marker: (marker) => {
      if (WeakRefCtor) markers.add(new WeakRefCtor(marker))
    },
    focus: () => view?.focus(),
    replay: (direction) => replay(direction),
    canReplay: (direction) => history.has(direction),
  }

  // Extensions that declare state become engine plugins, reduced per transaction.
  const plugins = stateful.map((def) => {
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

  // Extensions that veto changes become filters. The ctx they get is built on
  // the state as it is, holding the transaction as it would be, so a filter
  // can compare the two.
  for (const def of filters) {
    const filter = def.filterChange
    if (!filter) continue
    plugins.push(
      new Plugin({
        key: `${def.name}:filter`,
        filterTransaction: (tr, editorState) => {
          try {
            return filter.call(def, createCtx(host, editorState, tr)) !== false
          } catch (error) {
            // A filter that throws has not said yes.
            console.error(`Matra: filterChange in "${def.name}" threw`, error)
            return false
          }
        },
      }),
    )
  }

  let state = EditorState.create({
    schema,
    doc: options.content ? parseContent(schema, parser, options.content) : undefined,
    plugins,
  })

  function emit(event: EventName) {
    const set = listeners.get(event)
    if (!set) return
    for (const fn of set) fn(editor)
  }

  /** Single funnel for every state change — view-mounted or headless. False when a filter refused it. */
  function apply(tr: Transaction): boolean {
    const selectionMoved = !tr.selection.eq(state.selection)
    const before = state.doc
    const selectionBefore = { anchor: state.selection.anchor, head: state.selection.head }

    const next = state.apply(tr)
    // A filter refusing the transaction returns the same state object, and a
    // refused change must leave no trace: the history is written only once the
    // change is known to have landed, or undo would replay the inverse of an
    // edit that never happened. The screen is put back too, for the one input
    // path that writes to the DOM before asking — an IME composition.
    if (next === state) {
      if (tr.docChanged) view?.restore()
      return false
    }
    if (tr.docChanged) {
      history.record(tr, before, selectionBefore, Date.now(), tr.getMeta(ISOLATE) === true)
    }

    state = next
    // A transaction that moved nothing maps every position to itself, and a
    // marker mapping through it learns nothing · so only real changes are kept.
    if (tr.mapping.maps.length) remember(tr.mapping)
    view?.updateState(state, tr.mapping)
    if (tr.docChanged) emit('change')
    if (selectionMoved) emit('selectionChange')
    return true
  }

  /** Run a function against a fresh Ctx; dispatch only if it asked to keep changes. */
  function run(fn: (ctx: CommandContext) => boolean): boolean {
    const ctx = createCtx(host, state, null)

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
    // A command that only read never started a transaction, and there is
    // nothing to apply. Metadata counts: a transaction that only carries meta
    // is how an extension tells its own reducer something happened.
    const tr = ctx.started
    if (tr && (tr.docChanged || tr.selectionSet || tr.storedMarksSet || tr.metaSet)) {
      // A command whose change was refused did not succeed, whatever it said.
      return apply(tr)
    }
    return true
  }

  // --- command surface ------------------------------------------------------

  /**
   * Run a command against a transaction that is then thrown away.
   *
   * A command already answers "did this work" — but only by doing it, which is
   * no use to a toolbar that wants to grey out a button before the user
   * presses it. The command builds its transaction as usual and nothing is
   * applied, so asking costs a transaction and changes nothing.
   */
  function dryRun(fn: (ctx: CommandContext) => boolean): boolean {
    const ctx = createCtx(host, state, null, true)
    try {
      if (!fn(ctx)) return false
    } catch {
      return false
    }
    // A change a filter would refuse is a change that cannot be made, and a
    // button asking should be told so rather than pressed.
    const tr = ctx.started
    if (!tr || !tr.docChanged || !filters.length) return true
    return state.plugins.every((plugin) => plugin.spec.filterTransaction?.(tr, state) !== false)
  }

  function bind(
    target: Record<string, AnyCommand>,
    invoke: (fn: (ctx: CommandContext) => boolean) => boolean,
  ) {
    const bound: Record<string, (...args: unknown[]) => boolean> = {}
    for (const [name, command] of Object.entries(target)) {
      bound[name] = (...args: unknown[]) => invoke((ctx) => command(ctx, ...args))
    }
    return bound as CommandsOf<T> & CoreCommands
  }

  const commands = bind(rawCommands, run)
  const can = bind(rawCommands, dryRun)

  // --- keymap, input rules and history ---------------------------------------

  const history = new History()
  const keys = new Keymap()
  for (const [combo, command] of bindings) keys.add(combo, () => run((ctx) => command(ctx)))
  keys.add('Mod-z', () => replay('undo'))
  keys.add('Mod-y', () => replay('redo'))
  keys.add('Shift-Mod-z', () => replay('redo'))

  /** Rewind or replay one history entry as a single transaction. */
  function replay(direction: 'undo' | 'redo'): boolean {
    const entry = history.take(direction)
    if (!entry) return false
    const tr = state.tr
    // Newest inverse first: the entry holds them in the order they were made.
    for (let i = entry.steps.length - 1; i >= 0; i--) tr.step(entry.steps[i] as Step)
    tr.setSelection(TextSelection.create(tr.doc, entry.selection.anchor, entry.selection.head))
    // Said so, because a change that was allowed must be allowed back out:
    // locking a block is an edit, and undoing it touches a locked block.
    tr.setMeta(REPLAY, direction)
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

  /** Offer a paste or a drop to the extensions that asked for them, in order. */
  function offer(
    handlers: ExtensionDef[],
    call: (def: ExtensionDef, ctx: CommandContext) => boolean | undefined,
  ): boolean {
    for (const def of handlers) {
      let handled = false
      run((ctx) => {
        handled = call(def, ctx) === true
        return handled
      })
      if (handled) return true
    }
    return false
  }

  /** Ask every extension what it wants drawn, right now. */
  function collectDecorations(): DecorationSet {
    if (!decorators.length) return DecorationSet.empty
    const specs: DecorationSpec[] = []
    for (const def of decorators) {
      const ctx = createCtx(host, state, null)
      try {
        const own = def.decorations?.(ctx)
        if (own) for (const spec of own) specs.push(spec)
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
    can,

    batch(runner) {
      const ctx = createCtx(host, state, null)
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
      const tr = ctx.started
      if (tr && (tr.docChanged || tr.selectionSet || tr.storedMarksSet || tr.metaSet)) {
        return apply(tr)
      }
      return true
    },

    /**
     * Is this mark on, or is the caret inside this node?
     *
     * A toolbar without this is a row of buttons that all look the same
     * whether or not the thing they do is already done — you press bold and
     * have to look at the text to find out what happened. The commands could
     * always answer the question; only nothing outside a command could ask it.
     *
     * Read straight off the state: a question that starts a transaction to
     * answer itself is a question a toolbar of ten buttons asks ten times per
     * caret move.
     */
    isActive: (name: string, attrs?: Record<string, unknown>) => {
      const ctx = createCtx(host, state, null)
      return schema.marks[name] ? ctx.hasMark(name, attrs) : ctx.inNode(name, attrs)
    },

    extensionState: <S = unknown>(name: string) => state.pluginState(name) as S | undefined,

    getJSON: () => state.doc.toJSON() as unknown as DocNode,

    getHTML: () => htmlSerializer.serializeHTML(state.doc.content),

    getText: () => state.doc.textBetween(0, state.doc.content.size, '\n'),

    /**
     * Replace the document, and start its history here.
     *
     * The history is cleared deliberately. Loading document B into an editor
     * that held document A left one press of undo standing between the user
     * and A's content — in an editor that would then save it under B's id.
     * That is silent data loss, and it looked like a working undo.
     *
     * To change the document somebody is editing, use a command:
     * `replace(range, content)` is an edit and belongs in the history.
     */
    setContent(content) {
      const tr = state.tr
      const parsed = parseContent(schema, parser, content)
      tr.replaceWith(0, state.doc.content.size, parsed.content)
      // Loading a document is not an edit of the one before it, so nothing
      // that guards the old document — a locked block — has a say.
      tr.setMeta(REPLACE_ALL, true)
      apply(tr)
      history.clear()
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
      for (const [name, factory] of Object.entries(nodeViewFactories)) {
        nodeViews[name] = ({ node, getPos }) => {
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
          onPaste: (data) =>
            pasteHandlers.length > 0 &&
            offer(pasteHandlers, (def, ctx) => def.handlePaste?.(ctx, data as PasteData)),
          onDrop: (data) =>
            dropHandlers.length > 0 &&
            offer(dropHandlers, (def, ctx) => def.handleDrop?.(ctx, data as DropData)),
        },
      })
      element.addEventListener('focus', () => emit('focus'))
      element.addEventListener('blur', () => emit('blur'))
      for (const def of lifecycle) def.onCreate?.(editor)
      if (options.autofocus) view.focus()
    },

    destroy() {
      for (const def of lifecycle) def.onDestroy?.(editor)
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

  if (lifecycle.some((def) => def.onChange)) {
    editor.on('change', () => {
      for (const def of lifecycle) def.onChange?.(editor)
    })
  }

  // Last, so that `onCreate` — which mounting runs — sees a finished editor.
  if (options.element) editor.mount(options.element)

  return editor
}

function parseContent(schema: Schema, parser: DOMParser, content: DocNode | string): Node {
  if (typeof content !== 'string') return schema.nodeFromJSON(content)
  const container = document.createElement('div')
  container.innerHTML = content
  return parser.parse(container)
}

export { Fragment }
