import type { Node, NodeType } from '../engine/model'
import type { Transaction } from '../engine/state'
import { engine } from '../internal'
import type { Command, DecorationSpec, DocNode, ExtensionDef, NodeDef, Pos } from '../types'
import { type BlockCache, scanBlocks } from './block-scan'

const REF = 'footnoteRef' as const
const NOTE = 'footnote' as const
const LIST = 'footnotes' as const

/** Short, URL-safe and with no room for markup: an id is a key, not a label. */
const ID = /^[A-Za-z0-9_-]{1,64}$/

const isId = (value: unknown): value is string => typeof value === 'string' && ID.test(value)

const readId =
  (attribute: string) =>
  (dom: Element | string): { id: string } | false => {
    const id = typeof dom === 'string' ? null : dom.getAttribute(attribute)
    return isId(id) ? { id } : false
  }

const idOf = (node: DocNode): string => String(node.attrs?.id ?? '')

/**
 * The marker in the text.
 *
 * It carries an id and nothing else. Its number is a decoration computed
 * from where it stands, so moving a paragraph renumbers every note without
 * a single change to the document, and two people looking at the same
 * document see the same numbers. The element is empty in HTML; the number
 * is drawn by `footnotesCSS` from the decoration's attribute.
 */
export const footnoteRef = {
  kind: 'node',
  name: REF,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,
  attrs: { id: { required: true } },
  // Above the default, so the superscript mark's plain `sup` rule loses.
  parseDOM: [
    { tag: 'sup[data-footnote-ref]', priority: 60, getAttrs: readId('data-footnote-ref') },
  ],
  toDOM: (node) => ['sup', { 'data-footnote-ref': idOf(node), class: 'matra-footnote-ref' }],
} satisfies NodeDef

/** The note itself: blocks, under the id its marker carries. */
export const footnote = {
  kind: 'node',
  name: NOTE,
  content: 'block+',
  attrs: { id: { required: true } },
  // Above the default, so a list item's plain `li` rule loses.
  parseDOM: [{ tag: 'li[data-footnote]', priority: 60, getAttrs: readId('data-footnote') }],
  toDOM: (node) => ['li', { 'data-footnote': idOf(node), class: 'matra-footnote' }, 0],
} satisfies NodeDef

/** The list the notes live in, kept as the last block by `insertFootnote`. */
export const footnotes = {
  kind: 'node',
  name: LIST,
  group: 'block',
  content: 'footnote*',
  parseDOM: [{ tag: 'ol[data-footnotes]', priority: 60 }],
  toDOM: () => ['ol', { 'data-footnotes': '', class: 'matra-footnotes' }, 0],
} satisfies NodeDef

/** A marker or a note, where it is. */
interface Entry {
  kind: 'ref' | 'note'
  id: string
  from: number
  to: number
}

/** What one document says about its notes, computed once per document. */
interface Index {
  doc: Node
  /** Every marker and note, in document order. */
  entries: Entry[]
  decorations: DecorationSpec[]
}

/** The markers and notes inside one top-level block, relative to its position. */
function scanBlock(block: Node): Entry[] {
  const out: Entry[] = []
  block.descendants((node, pos) => {
    const name = node.type.name
    if (name !== REF && name !== NOTE) return undefined
    out.push({
      kind: name === REF ? 'ref' : 'note',
      id: String(node.attrs.id),
      from: pos,
      to: pos + node.nodeSize,
    })
    return undefined
  }, 1)
  return out
}

/**
 * Number the markers in document order and hand each note its marker's
 * number. Per block, cached on the block: typing in one paragraph rescans
 * that paragraph and reads the rest out of the cache.
 */
function index(doc: Node, cache: BlockCache<Entry[]>): Index {
  const entries: Entry[] = []
  scanBlocks(doc, cache, scanBlock, (local, _block, pos) => {
    for (const entry of local) {
      entries.push({ ...entry, from: pos + entry.from, to: pos + entry.to })
    }
  })
  // The first marker for an id sets its number; a second marker for the same
  // note shares it, the way a book cites one note twice.
  const numbers = new Map<string, number>()
  for (const entry of entries) {
    if (entry.kind === 'ref' && !numbers.has(entry.id)) numbers.set(entry.id, numbers.size + 1)
  }
  const decorations: DecorationSpec[] = []
  for (const entry of entries) {
    const number = numbers.get(entry.id)
    decorations.push({
      type: 'node',
      from: entry.from as Pos,
      to: entry.to as Pos,
      attrs:
        number === undefined
          ? { class: 'matra-footnote-orphan' }
          : { 'data-footnote-number': String(number) },
    })
  }
  return { doc, entries, decorations }
}

/**
 * `f`, a count, and a little randomness: unique in this document, and
 * unlikely to collide with a note pasted in from another one.
 */
function freshId(taken: Index): string {
  const used = new Set<string>()
  for (const entry of taken.entries) used.add(entry.id)
  for (let n = used.size + 1; ; n++) {
    const id = `f${n}${Math.random().toString(36).slice(2, 6)}`
    if (!used.has(id)) return id
  }
}

/**
 * The notes block, last in the document: found there, moved there, or made.
 *
 * Notes belong under the text. The block is put back at the end when a note
 * is added rather than pinned there with a filter, because a filter would
 * refuse the paragraph somebody types after the notes — a fine thing to want
 * right up until the next note.
 */
function listLast(tr: Transaction, type: NodeType): { pos: number; node: Node } {
  const blocks = tr.doc.content.content
  let pos = 0
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Node
    if (block.type === type) {
      if (i === blocks.length - 1) return { pos, node: block }
      tr.delete(pos, pos + block.nodeSize)
      const end = tr.doc.content.size
      tr.insert(end, block)
      return { pos: end, node: block }
    }
    pos += block.nodeSize
  }
  const node = type.create()
  const end = tr.doc.content.size
  tr.insert(end, node)
  return { pos: end, node }
}

/** An `<ol>` with nothing in it is a rule across the foot of the page with nothing under it. */
function dropEmptyList(tr: Transaction, type: NodeType, paragraph: NodeType | undefined): void {
  const blocks = tr.doc.content.content
  let pos = 0
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Node
    if (block.type === type && block.childCount === 0) {
      // A document keeps at least one block; a paragraph stands in for the last.
      if (blocks.length > 1) tr.delete(pos, pos + block.nodeSize)
      else if (paragraph) tr.replaceWith(pos, pos + block.nodeSize, paragraph.create())
      return
    }
    pos += block.nodeSize
  }
}

type FootnoteCommands = {
  insertFootnote: Command
  removeFootnote: Command<[id: string]>
  goToFootnote: Command<[id: string]>
  goToFootnoteRef: Command<[id: string]>
}

/**
 * Numbering and the commands, as one extension per editor.
 *
 * A factory rather than a constant because the numbering is memoised on the
 * document it was computed for, and two editors must not share that.
 */
function footnoteBehaviour(): ExtensionDef<FootnoteCommands> {
  const cache: BlockCache<Entry[]> = new WeakMap()
  let last: Index | null = null
  const indexOf = (doc: Node): Index => {
    if (!last || last.doc !== doc) last = index(doc, cache)
    return last
  }
  const find = (doc: Node, kind: Entry['kind'], id: string): Entry | undefined =>
    indexOf(doc).entries.find((entry) => entry.kind === kind && entry.id === id)

  return {
    kind: 'extension',
    name: LIST,

    // The same array back while the document is the same object, so a caret
    // move costs a comparison and the editor skips the redraw.
    decorations: (ctx) => indexOf(engine(ctx).state.doc).decorations,

    commands: {
      /**
       * A marker at the caret and an empty note for it at the end, with the
       * caret moved into the note ready to type it.
       */
      insertFootnote: (ctx) => {
        const { tr, schema } = engine(ctx)
        const refType = schema.nodes[REF]
        const noteType = schema.nodes[NOTE]
        const listType = schema.nodes[LIST]
        const paragraph = schema.nodes.paragraph
        if (!refType || !noteType || !listType || !paragraph) return false

        const $to = tr.selection.$to
        if (!$to.parent.isTextblock || !$to.parent.type.contentMatch.matchType(refType)) {
          return false
        }
        // A note on a note is not a thing, and the caret would be sent into
        // a list nested inside itself.
        for (let depth = $to.depth; depth > 0; depth--) {
          if ($to.node(depth).type === listType) return false
        }

        const id = freshId(indexOf(tr.doc))
        tr.insert($to.pos, refType.create({ id }))
        const list = listLast(tr, listType)
        const end = list.pos + list.node.nodeSize - 1
        tr.insert(end, noteType.create({ id }, paragraph.create()))
        tr.selectAt(end + 2)
        return true
      },

      /** The note and every marker for it. The list goes too once it is empty. */
      removeFootnote: (ctx, id) => {
        if (!isId(id)) return false
        const { tr, schema } = engine(ctx)
        const listType = schema.nodes[LIST]
        if (!listType) return false
        const hits: Entry[] = []
        for (const entry of indexOf(tr.doc).entries) {
          if (entry.id !== id) continue
          // A marker inside the note being removed goes with the note.
          const outer = hits[hits.length - 1]
          if (outer && entry.from >= outer.from && entry.to <= outer.to) continue
          hits.push(entry)
        }
        if (!hits.length) return false
        // Later ones first, so earlier positions hold as the document shrinks.
        for (let i = hits.length - 1; i >= 0; i--) {
          const hit = hits[i] as Entry
          tr.delete(hit.from, hit.to)
        }
        dropEmptyList(tr, listType, schema.nodes.paragraph)
        return true
      },

      /** The caret into the note, at the first place text can go. */
      goToFootnote: (ctx, id) => {
        if (!isId(id)) return false
        const hit = find(engine(ctx).state.doc, 'note', id)
        return hit ? ctx.select((hit.from + 1) as Pos) : false
      },

      /** The caret to just after the marker, where the reader came from. */
      goToFootnoteRef: (ctx, id) => {
        if (!isId(id)) return false
        const hit = find(engine(ctx).state.doc, 'ref', id)
        return hit ? ctx.select(hit.to as Pos) : false
      },
    },
  }
}

/**
 * Footnotes: a marker in the text, a note at the end, numbered by position.
 *
 * ```ts
 * editor.commands.insertFootnote()      // a marker here, a note below, caret in the note
 * editor.commands.removeFootnote(id)    // both halves
 * editor.commands.goToFootnote(id)      // and back with goToFootnoteRef(id)
 * ```
 *
 * The numbers are never in the document. They are decorations, recomputed
 * per block when the document changes and not at all when only the caret
 * moves, so deleting a marker renumbers the rest as you watch and an undo
 * puts the old numbers back. A note whose marker is gone is left in place
 * and marked `matra-footnote-orphan`, rather than deleted behind your back.
 */
export function footnotesKit(): readonly [
  typeof footnoteRef,
  typeof footnote,
  typeof footnotes,
  ExtensionDef<FootnoteCommands>,
] {
  return [footnoteRef, footnote, footnotes, footnoteBehaviour()] as const
}

/**
 * The numbers, drawn from the decorations, and the list under a rule.
 *
 * In exported HTML there are no decorations: the `<ol>` numbers itself the
 * way any list does, and the markers are empty superscripts.
 */
export const footnotesCSS = `
.matra-footnote-ref { vertical-align: super; font-size: 0.75em; line-height: 1; cursor: pointer; }
.matra-footnote-ref::after { content: attr(data-footnote-number); }
.matra-footnotes { margin-top: 2em; padding: 0.75em 0 0 2em; border-top: 1px solid var(--matra-footnotes-border, #d9d9d9); font-size: 0.875em; }
.matra-footnote[data-footnote-number], .matra-footnote-orphan { list-style: none; position: relative; }
.matra-footnote[data-footnote-number]::before { content: attr(data-footnote-number) '.'; position: absolute; right: 100%; margin-right: 0.5em; }
.matra-footnote-orphan { opacity: 0.6; }
.matra-footnote-orphan::before { content: '?'; position: absolute; right: 100%; margin-right: 0.5em; }
`
