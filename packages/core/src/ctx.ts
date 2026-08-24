import { Fragment, type Node, type Schema } from './engine/model'
import type { EditorState, Transaction } from './engine/state'
import { TextSelection } from './engine/state'
import { type Mapping, findWrapping, liftTarget, stepFromJSON } from './engine/transform'
import { attachEngine } from './internal'
import type { Ctx, DocNode, Pos, PosMarker, Range, Selection } from './types'

/** The editor internals a Ctx is allowed to see. Deliberately tiny. */
export interface CtxHost {
  readonly schema: Schema
  /** One Mapping per transaction ever applied, in order. */
  readonly mappings: Mapping[]
  focus(): void
  replay(direction: 'undo' | 'redo'): boolean
}

const asPos = (n: number) => n as Pos

function toSelection(tr: Transaction): Selection {
  const sel = tr.selection
  return {
    from: asPos(sel.from),
    to: asPos(sel.to),
    anchor: asPos(sel.anchor),
    head: asPos(sel.head),
    empty: sel.empty,
  }
}

function resolveRange(tr: Transaction, range?: Range): { from: number; to: number } {
  if (range) return { from: range.from, to: range.to }
  return { from: tr.selection.from, to: tr.selection.to }
}

/**
 * Turn user content into nodes.
 *
 * A string is inline text — `insert('hi')` types, it does not create a block.
 * Structure is expressed with DocNode objects, which say what they are.
 */
function toNodes(schema: Schema, content: DocNode | DocNode[] | string): Node[] {
  if (typeof content === 'string') {
    return content.length ? [schema.text(content)] : []
  }
  const list = Array.isArray(content) ? content : [content]
  return list.map((node) => schema.nodeFromJSON(node))
}

export function createCtx(host: CtxHost, state: EditorState, tr: Transaction): Ctx {
  const schema = host.schema

  const markerFrom = (version: number): PosMarker => ({
    map(pos: Pos): Pos {
      let next: number = pos
      for (let i = version; i < host.mappings.length; i++) {
        const mapping = host.mappings[i]
        if (mapping) next = mapping.map(next)
      }
      return asPos(next)
    },
    mapRange(range: Range): Range {
      return { from: this.map(range.from), to: this.map(range.to) }
    },
  })

  const ctx: Ctx = {
    get doc() {
      return tr.doc.toJSON() as unknown as DocNode
    },
    get selection() {
      return toSelection(tr)
    },

    hasMark(name, attrs) {
      const type = schema.marks[name]
      if (!type) return false
      const { from, to, empty } = tr.selection
      if (empty) {
        const stored = tr.storedMarks ?? tr.selection.$head.marks()
        return stored.some((mark) => mark.type === type)
      }
      let found = false
      let allMarked = true
      tr.doc.descendants((node, pos) => {
        if (pos + node.nodeSize <= from || pos >= to || !node.isText) return undefined
        found = true
        const mark = node.marks.find((m) => m.type === type)
        const matches =
          mark && (!attrs || Object.entries(attrs).every(([k, v]) => mark.attrs[k] === v))
        if (!matches) allMarked = false
        return undefined
      })
      return found && allMarked
    },

    inNode(name, attrs) {
      const type = schema.nodes[name]
      if (!type) return false
      const $from = tr.selection.$from
      for (let depth = $from.depth; depth >= 0; depth--) {
        const node = $from.node(depth)
        if (node.type !== type) continue
        if (!attrs) return true
        if (Object.entries(attrs).every(([k, v]) => node.attrs[k] === v)) return true
      }
      return false
    },

    addMark(name, attrs, range) {
      const type = schema.marks[name]
      if (!type) return false
      const { from, to } = resolveRange(tr, range)
      if (from === to) {
        tr.addStoredMark(type.create(attrs))
        return true
      }
      tr.addMark(from, to, type.create(attrs))
      return true
    },

    removeMark(name, range, attrs) {
      const type = schema.marks[name]
      if (!type) return false
      const { from, to } = resolveRange(tr, range)

      if (from === to) {
        const stored = tr.storedMarks ?? tr.selection.$head.marks()
        const present = stored.find((mark) => mark.type === type)
        if (!present) return false
        tr.removeStoredMark(present)
        return true
      }

      // Remove the marks that are actually there. Building one from the type
      // alone fails for marks whose attributes are required, and would remove
      // the wrong thread where several overlap.
      const marks: Parameters<typeof tr.removeMark>[2][] = []
      tr.doc.descendants((node, pos) => {
        if (pos + node.nodeSize <= from || pos >= to || !node.isText) return undefined
        for (const mark of node.marks) {
          if (mark.type !== type) continue
          if (attrs && !Object.entries(attrs).every(([k, v]) => mark.attrs[k] === v)) continue
          if (!marks.some((existing) => existing.eq(mark))) marks.push(mark)
        }
        return undefined
      })
      if (!marks.length) return false
      for (const mark of marks) tr.removeMark(from, to, mark)
      return true
    },

    toggleMark(name, attrs) {
      return ctx.hasMark(name, attrs) ? ctx.removeMark(name) : ctx.addMark(name, attrs)
    },

    setBlockType(name, attrs) {
      const type = schema.nodes[name]
      if (!type || !type.isTextblock) return false
      const { from, to } = tr.selection
      tr.setBlockType(from, to, type, attrs)
      return true
    },

    wrapIn(name, attrs) {
      const type = schema.nodes[name]
      if (!type) return false
      const range = tr.selection.$from.blockRange(tr.selection.$to)
      if (!range) return false
      const wrapping = findWrapping(range, type, attrs)
      if (!wrapping) return false
      tr.wrap(range, wrapping)
      return true
    },

    lift() {
      const range = tr.selection.$from.blockRange(tr.selection.$to)
      if (!range) return false
      const target = liftTarget(range)
      if (target === null) return false
      tr.lift(range, target)
      return true
    },

    insert(content, at) {
      const nodes = toNodes(schema, content)
      if (!nodes.length) return false
      const pos = at ?? tr.selection.from
      tr.insert(pos, Fragment.from(nodes))
      return true
    },

    replace(range, content) {
      tr.replaceWith(range.from, range.to, Fragment.from(toNodes(schema, content)))
      return true
    },

    delete(range) {
      const { from, to } = resolveRange(tr, range)
      if (from === to) return false
      tr.delete(from, to)
      return true
    },

    select(range) {
      const from = typeof range === 'number' ? range : range.from
      const to = typeof range === 'number' ? range : range.to
      const max = tr.doc.content.size
      if (from < 0 || to > max) return false
      tr.setSelection(TextSelection.create(tr.doc, from, to))
      return true
    },

    focus() {
      host.focus()
      return true
    },

    mark() {
      // Mapping index at the moment of the call; every later transaction adds one.
      return markerFrom(host.mappings.length)
    },
  }

  attachEngine(ctx, {
    state,
    tr,
    schema,
    replay: (direction) => host.replay(direction),
    stepFromJSON: (json) => stepFromJSON(schema, json),
    pluginState: (key) => state.pluginState(key),
  })

  return ctx
}
