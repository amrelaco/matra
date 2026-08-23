import { history, redo, undo } from 'prosemirror-history'
import { InputRule as PMInputRule, inputRules } from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { DOMParser, DOMSerializer, type Schema } from 'prosemirror-model'
import { EditorState, type Transaction } from 'prosemirror-state'
import type { Mapping } from 'prosemirror-transform'
import { EditorView } from 'prosemirror-view'
import { type CtxHost, createCtx } from './ctx'
import { core } from './extensions/core'
import { buildSchema, sortByPriority } from './schema'
import type {
  AnyCommand,
  AnyDef,
  CommandsOf,
  CoreCommands,
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

  let view: EditorView | null = null
  let state = EditorState.create({
    schema,
    doc: options.content ? parseContent(schema, options.content) : undefined,
    plugins: [],
  })

  const host: CtxHost = {
    schema,
    mappings,
    focus: () => view?.focus(),
  }

  function emit(event: EventName) {
    for (const fn of listeners.get(event) ?? []) fn(editor)
  }

  /** Single funnel for every state change — view-mounted or headless. */
  function apply(tr: Transaction) {
    const selectionMoved = !tr.selection.eq(state.selection)
    state = state.apply(tr)
    mappings.push(tr.mapping)
    if (view) view.updateState(state)
    if (tr.docChanged) emit('change')
    if (selectionMoved) emit('selectionChange')
  }

  /** Run a function against a fresh Ctx; dispatch only if it asked to keep changes. */
  function run(fn: (ctx: ReturnType<typeof createCtx>) => boolean): boolean {
    const tr = state.tr
    const ctx = createCtx(host, state, tr)
    const ok = fn(ctx)
    if (!ok) return false
    if (tr.docChanged || tr.selectionSet || tr.storedMarksSet) apply(tr)
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

  // --- keymap and input rules ----------------------------------------------

  function buildKeymap(): Record<string, () => boolean> {
    const keys: Record<string, () => boolean> = {}
    for (const def of defs) {
      if (!def.keys) continue
      for (const [combo, target] of Object.entries(def.keys)) {
        const command =
          typeof target === 'function' ? (target as AnyCommand) : rawCommands[target as string]
        if (!command) continue
        keys[combo] = () => run((ctx) => command(ctx))
      }
    }
    keys['Mod-z'] = () => undo(state, (tr) => apply(tr))
    keys['Mod-y'] = () => redo(state, (tr) => apply(tr))
    keys['Shift-Mod-z'] = keys['Mod-y']
    return keys
  }

  function buildInputRules(): PMInputRule[] {
    const rules: PMInputRule[] = []
    for (const def of defs) {
      for (const rule of def.inputRules ?? []) {
        rules.push(
          new PMInputRule(rule.match, (_state, match, from, to) => {
            let handled = false
            run((ctx) => {
              handled = rule.handler(ctx, match, { from: asPos(from), to: asPos(to) })
              return handled
            })
            return handled ? state.tr : null
          }),
        )
      }
    }
    return rules
  }

  state = state.reconfigure({
    plugins: [history(), keymap(buildKeymap()), inputRules({ rules: buildInputRules() })],
  })

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
      if (tr.docChanged || tr.selectionSet || tr.storedMarksSet) apply(tr)
      return true
    },

    getJSON: () => state.doc.toJSON() as DocNode,

    getHTML() {
      const fragment = DOMSerializer.fromSchema(schema).serializeFragment(state.doc.content)
      const container = document.createElement('div')
      container.appendChild(fragment)
      return container.innerHTML
    },

    getText: () => state.doc.textBetween(0, state.doc.content.size, '\n'),

    setContent(content) {
      const tr = state.tr
      tr.replaceWith(0, state.doc.content.size, parseContent(schema, content).content)
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
      view?.setProps({ editable: () => value })
    },

    on(event, fn) {
      const set = listeners.get(event) ?? new Set()
      set.add(fn as (editor: Editor<T>) => void)
      listeners.set(event, set)
      return () => set.delete(fn as (editor: Editor<T>) => void)
    },

    mount(element) {
      if (view) throw new Error('Matra: editor is already mounted')
      view = new EditorView(element, {
        state,
        editable: () => options.editable ?? true,
        dispatchTransaction(tr) {
          apply(tr)
        },
        handleDOMEvents: {
          focus: () => {
            emit('focus')
            return false
          },
          blur: () => {
            emit('blur')
            return false
          },
        },
      })
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

function parseContent(schema: Schema, content: DocNode | string) {
  if (typeof content !== 'string') return schema.nodeFromJSON(content)
  const container = document.createElement('div')
  container.innerHTML = content
  return DOMParser.fromSchema(schema).parse(container)
}
