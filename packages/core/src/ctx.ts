import { Fragment, type Node, type Schema } from './engine/model'
import type { EditorState, Transaction } from './engine/state'
import { TextSelection } from './engine/state'
import { type Mapping, findWrapping, liftTarget, stepFromJSON } from './engine/transform'
import { ISOLATE, attachEngine } from './internal'
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

/**
 * Is this a position the document could actually contain?
 *
 * Positions arrive from extensions, collaborative peers and application code.
 * NaN slips through naive range checks — `NaN < 0` and `NaN > size` are both
 * false — so it is rejected explicitly rather than reaching the position maths.
 */
function validPos(value: unknown, size: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= size
}

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

    /**
     * Change the attributes of the nearest ancestor of `name`.
     *
     * The counterpart to `setBlockType` for nodes that are not textblocks: a
     * checklist item, a table cell, a callout. Ticking a box is a change to one
     * attribute of a node the caret is *inside*, and there was no way to say
     * that — `setBlockType` refuses anything whose content is blocks rather
     * than text, so the command underneath the checkbox returned false every
     * time and the document never heard about it.
     */
    setNodeAttrs(name, attrs, at) {
      const type = schema.nodes[name]
      if (!type) return false

      // Given a position, use it. A control that already knows which node it
      // belongs to should not have to move the caret onto that node first —
      // clicking a checkbox would then take your cursor with it.
      if (at !== undefined) {
        const node = tr.doc.resolve(at).nodeAfter
        if (!node || node.type !== type) return false
        tr.setNodeAttrs(at, attrs ?? {})
        return true
      }

      const $from = tr.selection.$from
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type !== type) continue
        tr.setNodeAttrs($from.before(depth), attrs ?? {})
        return true
      }
      return false
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
      if (!validPos(pos, tr.doc.content.size)) return false
      tr.insert(pos, Fragment.from(nodes))
      return true
    },

    replace(range, content) {
      const size = tr.doc.content.size
      if (!validPos(range.from, size) || !validPos(range.to, size)) return false
      if (range.from > range.to) return false
      tr.replaceWith(range.from, range.to, Fragment.from(toNodes(schema, content)))
      return true
    },

    delete(range) {
      const { from, to } = resolveRange(tr, range)
      const size = tr.doc.content.size
      if (!validPos(from, size) || !validPos(to, size)) return false
      if (from >= to) return false
      tr.delete(from, to)
      return true
    },

    select(range) {
      // `range` crosses the public boundary, so it may be anything at runtime.
      // Reaching into `.from` of a null is a crash, not a refusal.
      if (typeof range !== 'number' && (range === null || typeof range !== 'object'))
        return false
      const from = typeof range === 'number' ? range : range.from
      const to = typeof range === 'number' ? range : range.to
      const size = tr.doc.content.size
      if (!validPos(from, size) || !validPos(to, size)) return false
      tr.setSelection(TextSelection.create(tr.doc, from, to))
      return true
    },

    moveBlock(from, to) {
      const size = tr.doc.content.size
      if (!validPos(from, size) || !validPos(to, size)) return false
      const { index, offset } = tr.doc.content.findIndex(from)
      // Only whole blocks move. A position inside one is not a boundary, and
      // silently moving the block it happens to be in is a surprise.
      if (offset !== from || index >= tr.doc.content.childCount) return false
      const node = tr.doc.content.child(index)
      const cut = { from, to: from + node.nodeSize }
      // Dropping a block inside itself is a no-op, not a delete.
      if (to >= cut.from && to <= cut.to) return false
      // Everything after the removed block shifts back by its size, so the
      // target is mapped through the deletion rather than recomputed.
      const insertAt = to > cut.to ? to - node.nodeSize : to
      tr.delete(cut.from, cut.to)
      tr.insert(insertAt, node)
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

    isolateUndo() {
      tr.setMeta(ISOLATE, true)
      return true
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
