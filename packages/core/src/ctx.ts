import { Fragment, type Node as PMNode, type Schema } from 'prosemirror-model'
import { type EditorState, TextSelection, type Transaction } from 'prosemirror-state'
import type { Mapping } from 'prosemirror-transform'
import { findWrapping, liftTarget } from 'prosemirror-transform'
import type { Ctx, DocNode, Pos, PosMarker, Range, Selection } from './types'

/** The editor internals a Ctx is allowed to see. Deliberately tiny. */
export interface CtxHost {
  readonly schema: Schema
  /** One Mapping per transaction ever applied, in order. */
  readonly mappings: Mapping[]
  focus(): void
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
 * Turn user content into ProseMirror nodes.
 *
 * A string is inline text — `insert('hi')` types, it does not create a block.
 * Structure is expressed with DocNode objects, which say what they are.
 */
function toNodes(schema: Schema, content: DocNode | DocNode[] | string): PMNode[] {
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
      return tr.doc.toJSON() as DocNode
    },
    get selection() {
      return toSelection(tr)
    },

    hasMark(name, attrs) {
      const type = schema.marks[name]
      if (!type) return false
      const { from, to, empty } = tr.selection
      if (empty) {
        const stored = tr.storedMarks ?? state.storedMarks ?? tr.selection.$from.marks()
        return type.isInSet(stored) != null
      }
      return tr.doc.rangeHasMark(from, to, attrs ? type.create(attrs) : type)
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

    removeMark(name, range) {
      const type = schema.marks[name]
      if (!type) return false
      const { from, to } = resolveRange(tr, range)
      if (from === to) {
        tr.removeStoredMark(type)
        return true
      }
      tr.removeMark(from, to, type)
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
      if (target == null) return false
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
      const nodes = toNodes(schema, content)
      tr.replaceWith(range.from, range.to, Fragment.from(nodes))
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

  return ctx
}
