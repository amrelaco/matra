import type { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import { finalizeElement, setSafeAttribute } from '../model/safe-attrs'
import type { DOMOutputSpec, Schema } from '../model/schema'
import { type Decoration, DecorationSet } from './decoration'
import { DOMMap } from './dom-map'
import { type NodeViewHost, NodeViewManager } from './node-view'

/**
 * Document → DOM, patched rather than rebuilt.
 *
 * Rebuilding everything on each keystroke is O(document) per character, throws
 * away the browser's selection, and would destroy any node view holding its own
 * state. Nodes are immutable, so an edit inside one paragraph leaves every
 * other paragraph as literally the same object — identity alone lets most of
 * the tree be skipped.
 */
export class Renderer {
  readonly map = new DOMMap()
  readonly nodeViews: NodeViewManager
  private previous: Node | null = null
  private previousDecorations = DecorationSet.empty
  /** The span this render is allowed to confine itself to, if any. */
  private dirty: { from: number; to: number } | null = null
  private decorations = DecorationSet.empty
  private root: HTMLElement | null = null
  /**
   * Where each rendered node keeps its children.
   *
   * Usually the node's own element, but `toDOM` may put the hole further down —
   * a table is `['table', ['tbody', 0]]`, so its rows live in the `<tbody>` and
   * not in the `<table>`. Patching into the outer element instead walks the
   * wrong list: model children get lined up against the single `<tbody>`, cells
   * are patched as if they were rows, and the table quietly doubles. Recorded
   * on the way out of `buildNode`, which is the only place the pairing is known.
   */
  private readonly holes = new WeakMap<globalThis.Node, HTMLElement>()

  constructor(
    private readonly schema: Schema,
    host?: NodeViewHost,
  ) {
    this.nodeViews = new NodeViewManager(host)
  }

  render(
    doc: Node,
    target: HTMLElement,
    decorations = DecorationSet.empty,
    dirty: { from: number; to: number } | null = null,
  ): void {
    // A span is only safe to trust when the decorations are the same as last
    // time. A remote cursor moving is a change no step accounts for, and
    // skipping past it would leave it undrawn.
    this.dirty = dirty && decorations.eq(this.previousDecorations) ? dirty : null
    this.decorations = decorations
    const canPatch = this.previous !== null && this.root === target
    // Enough edits have piled up that replaying them for a cold entry costs
    // more than saying where everything is again. That used to mean rebuilding
    // the document's DOM from scratch — every sixty-fourth keystroke tore down
    // and rebuilt every block, which on a long document was the most expensive
    // thing typing did and also dropped every node view's state on the way
    // past. The backlog is what went stale, not the DOM, so only the backlog is
    // thrown away.
    const backlog = canPatch && this.map.stale
    // Only a full rebuild may drop the index: on a patch, entries for subtrees
    // that kept their position are the ones deliberately not rewritten.
    if (!canPatch) this.map.clear()
    this.root = target
    this.map.record(target, 0)

    if (!canPatch) {
      this.nodeViews.destroyAll()
      // Built detached and attached in one go. Appending each block straight
      // into a mounted element is two hundred separate insertions into a live
      // tree, each one something the browser has to account for; a fragment is
      // one.
      const holder = document.createDocumentFragment()
      this.buildFragment(doc.content, holder, 0)
      target.replaceChildren(holder)
    } else {
      this.patchFragment(target, this.previous as Node, doc, 0)
    }

    // After the patch, not before: re-recording has to be done in the
    // coordinates the document is in now, and before the patch it is still in
    // the ones the edit moved away from.
    if (backlog) {
      this.map.reindex()
      this.map.record(target, 0)
      this.recordWithin(doc.content, target, 0)
    }

    this.previous = doc
    this.previousDecorations = decorations
  }

  /** Forget the rendered tree; the next render rebuilds from scratch. */
  reset(): void {
    this.previous = null
    this.nodeViews.destroyAll()
  }

  // --- building ------------------------------------------------------------

  /**
   * Build a run of nodes into `target`.
   *
   * Written as a plain loop over the run rather than around the offset
   * generator, and every allocation in it is behind the condition that needs
   * it. This is the whole of a first render: on two hundred blocks the mark
   * stack was three arrays per child for marks no block has, and the two
   * decoration filters were two more per text node for a document nobody had
   * decorated.
   */
  private buildFragment(fragment: Fragment, target: globalThis.Node, start: number): void {
    const children = fragment.content
    const decorated = this.decorations.size > 0
    const openMarks: Mark[] = []
    const openTargets: globalThis.Node[] = [target]
    let offset = 0

    for (let index = 0; index < children.length; index++) {
      const child = children[index] as Node
      let parent = target

      // Only pay for the mark stack when marks are in play at all.
      if (openMarks.length !== 0 || child.marks.length !== 0) {
        let keep = 0
        while (
          keep < openMarks.length &&
          keep < child.marks.length &&
          (openMarks[keep] as Mark).eq(child.marks[keep] as Mark)
        ) {
          keep++
        }
        openMarks.length = keep
        openTargets.length = keep + 1

        for (let m = keep; m < child.marks.length; m++) {
          const mark = child.marks[m] as Mark
          const spec = this.schema.marks[mark.type.name]?.spec
          const rendered = spec?.toDOM
            ? renderSpec(spec.toDOM(mark) as DOMOutputSpec)
            : { dom: document.createElement('span'), hole: null }
          ;(openTargets[openTargets.length - 1] as globalThis.Node).appendChild(rendered.dom)
          openMarks.push(mark)
          openTargets.push((rendered.hole ?? rendered.dom) as globalThis.Node)
        }
        parent = openTargets[openTargets.length - 1] as globalThis.Node
      }

      const pos = start + offset
      if (decorated) this.insertWidgets(parent, pos)

      if (child.isText) {
        if (decorated) {
          for (const piece of this.buildDecoratedText(child, pos)) parent.appendChild(piece)
        } else {
          parent.appendChild(document.createTextNode(child.text ?? ''))
        }
      } else {
        const dom = this.buildNode(child, pos)
        parent.appendChild(decorated ? this.decorate(dom, child, pos) : dom)
      }
      offset += child.nodeSize
    }

    // Widgets sitting at the very end of the fragment.
    if (decorated) this.insertWidgets(target, start + fragment.size)
  }

  private insertWidgets(target: globalThis.Node, pos: number): void {
    for (const item of this.decorations.items) {
      if (item.type !== 'widget' || item.pos !== pos) continue
      target.appendChild(this.buildWidget(item))
    }
  }

  /** Widgets are DOM the document does not contain, so they are marked inert. */
  private buildWidget(item: Extract<Decoration, { type: 'widget' }>): HTMLElement {
    const dom = item.render()
    dom.setAttribute('contenteditable', 'false')
    dom.setAttribute('data-matra-widget', item.key ?? '')
    return dom
  }

  /**
   * Text, split at decoration boundaries.
   *
   * An inline decoration usually covers part of a text node — one word inside a
   * paragraph. Wrapping the whole node would highlight the entire paragraph, so
   * the text is cut at every boundary and each piece wrapped in whatever covers
   * exactly it.
   */
  private buildDecoratedText(node: Node, pos: number): globalThis.Node[] {
    const text = node.text ?? ''
    const end = pos + text.length
    const inline = this.decorations.items.filter(
      (item): item is Extract<Decoration, { type: 'inline' }> =>
        item.type === 'inline' && item.to > pos && item.from < end,
    )
    // A widget *inside* this text — a remote caret between two letters. The
    // boundaries of the fragment are handled by the caller; these are the ones
    // that would otherwise have nowhere to go, and a caret sitting mid-word is
    // the ordinary case, not the exotic one.
    const widgets = this.decorations.items.filter(
      (item): item is Extract<Decoration, { type: 'widget' }> =>
        item.type === 'widget' && item.pos > pos && item.pos < end,
    )
    if (!inline.length && !widgets.length) return [document.createTextNode(text)]

    const points = new Set<number>([0, text.length])
    for (const item of inline) {
      points.add(Math.max(0, item.from - pos))
      points.add(Math.min(text.length, item.to - pos))
    }
    for (const item of widgets) points.add(item.pos - pos)
    const boundaries = [...points].sort((a, b) => a - b)

    const out: globalThis.Node[] = []
    for (let i = 0; i < boundaries.length - 1; i++) {
      const from = boundaries[i] as number
      const to = boundaries[i + 1] as number

      for (const widget of widgets) {
        if (widget.pos - pos === from) out.push(this.buildWidget(widget))
      }
      if (to <= from) continue

      let piece: globalThis.Node = document.createTextNode(text.slice(from, to))
      for (const item of inline) {
        if (item.from > pos + from || item.to < pos + to) continue
        const span = document.createElement('span')
        applyAttrs(span, item.attrs)
        span.appendChild(piece)
        piece = span
      }
      out.push(piece)
    }
    return out
  }

  /** Wrap or annotate a rendered node according to the decorations over it. */
  private decorate(dom: globalThis.Node, node: Node, pos: number): globalThis.Node {
    if (!this.decorations.size) return dom
    const end = pos + node.nodeSize
    const result = dom

    for (const item of this.decorations.items) {
      if (item.type !== 'node') continue
      if (item.to <= pos || item.from >= end) continue
      if (dom.nodeType === 1) applyAttrs(dom as HTMLElement, item.attrs)
    }
    return result
  }

  private buildNode(node: Node, pos: number): globalThis.Node {
    if (node.isText) return document.createTextNode(node.text ?? '')

    const view = this.nodeViews.create(node, pos)
    if (view) {
      if (view.contentDOM && !node.type.isLeaf) {
        this.map.record(view.contentDOM, pos + 1)
        this.buildFragment(node.content, view.contentDOM, pos + 1)
      } else {
        this.map.recordAtom(view.dom)
      }
      return view.dom
    }

    const spec = node.type.spec
    if (!spec.toDOM) {
      throw new Error(`Matra: node "${node.type.name}" has no toDOM, so it cannot be rendered`)
    }
    const out = spec.toDOM(node)
    // `['p', 0]` — a tag and a hole — is what most nodes render as, and there
    // is one of these per block on the page. Taking it directly skips the
    // walk and the result object renderSpec would allocate to say the same
    // thing.
    if (
      !node.type.isLeaf &&
      Array.isArray(out) &&
      out.length === 2 &&
      typeof out[0] === 'string' &&
      out[1] === 0
    ) {
      const simple = document.createElement(out[0])
      this.map.record(simple, pos + 1)
      this.buildFragment(node.content, simple, pos + 1)
      fillEmptyTextblock(simple, node)
      return simple
    }
    const { dom, hole } = renderSpec(out)
    if (hole && !node.type.isLeaf) {
      if (hole !== dom) this.holes.set(dom, hole as HTMLElement)
      this.map.record(hole, pos + 1)
      this.buildFragment(node.content, hole, pos + 1)
      fillEmptyTextblock(hole as HTMLElement, node)
    } else {
      // A break, a rule, an image, a mention: one position, no insides. Said
      // here because this is where a leaf and a mark wrapper stop looking alike.
      this.map.recordAtom(dom)
    }
    return dom
  }

  // --- patching ------------------------------------------------------------

  /** The element holding this node's children · a view's, a nested hole, or itself. */
  private contentOf(dom: globalThis.Node): HTMLElement {
    const view = this.nodeViews.contentDOM(dom)
    return (view ?? this.holes.get(dom) ?? dom) as HTMLElement
  }

  /** Reconcile one container's children, reusing DOM wherever the node is unchanged. */
  private patchFragment(
    target: HTMLElement,
    oldParent: Node,
    newParent: Node,
    contentStart: number,
  ): void {
    const oldChildren = oldParent.content
    const newChildren = newParent.content

    // Inline content is small and mark wrappers make its DOM shape diverge from
    // the fragment, so a textblock's inside is rebuilt whole. Everything above
    // that is patched.
    if (newParent.isTextblock) {
      const decorationsChanged = !sameOver(
        this.previousDecorations,
        this.decorations,
        contentStart,
        contentStart + newChildren.size,
      )
      if (!oldChildren.eq(newChildren) || decorationsChanged) {
        this.nodeViews.destroyWithin(target)
        target.replaceChildren()
        this.buildFragment(newChildren, target, contentStart)
        fillEmptyTextblock(target, newParent)
      } else {
        this.recordWithin(newChildren, target, contentStart)
      }
      return
    }

    const count = Math.max(oldChildren.childCount, newChildren.childCount)
    // Read straight out of the runs and hoist what the loop would otherwise
    // ask for once per child. At two thousand blocks the loop runs two thousand
    // times per keystroke however little each turn does, so what each turn does
    // is the whole cost.
    const oldList = oldChildren.content
    const newList = newChildren.content
    const plainDocument = this.nodeViews.empty

    // When the edit is confined and no blocks were added or removed, the loop
    // can start at the first child the edit reached instead of at zero.
    // Everything before it holds the same node in the same DOM at the same
    // position, and everything after it is handled by the position map, which
    // shifts lazily. Without this a keystroke walks every block in the
    // document, and on a long one that walk is the whole cost.
    const window = this.editWindow(oldChildren, newChildren, contentStart)
    let offset = window.offset

    for (let i = window.from; i < count; i++) {
      const oldChild = oldList[i] ?? null
      const newChild = newList[i] ?? null

      // Outside the edit entirely: same node, same DOM, and the position map
      // already accounts for the shift. There is nothing to ask about, so the
      // loop steps over it without reaching into the DOM at all — `childNodes`
      // is a live list, and indexing it for a child nobody is going to touch
      // was the single most expensive thing a keystroke did on a long
      // document. This is what makes a keystroke cost the size of the
      // paragraph rather than the size of the document.
      if (
        oldChild !== null &&
        oldChild === newChild &&
        plainDocument &&
        this.untouched(contentStart + offset, newChild.nodeSize)
      ) {
        offset += newChild.nodeSize
        continue
      }

      const dom = target.childNodes[i] ?? null

      if (!newChild) {
        // Remove whatever is left over, from the end so indices hold.
        for (let j = target.childNodes.length - 1; j >= i; j--) {
          const extra = target.childNodes[j]
          if (extra) {
            this.nodeViews.destroyWithin(extra)
            extra.remove()
          }
        }
        break
      }

      if (!oldChild || !dom) {
        target.appendChild(this.buildNode(newChild, contentStart + offset))
        offset += newChild.nodeSize
        continue
      }

      // Immutability pays here: an untouched subtree is the same object — but
      // only the *document* is untouched. Decorations are drawn over it and
      // change on their own: a remote cursor moves, a search highlight lands,
      // a selection-driven mark appears, all without a single step. Skipping on
      // node identity alone leaves every one of those invisible until something
      // else happens to edit that paragraph.
      if (
        oldChild === newChild &&
        sameOver(
          this.previousDecorations,
          this.decorations,
          contentStart + offset,
          contentStart + offset + newChild.nodeSize,
        )
      ) {
        // Same node, same decorations — and if the map already places it here,
        // then so are all of its descendants, because their positions are this
        // one's plus offsets that did not change either. Walking in would write
        // back the values already there.
        //
        // This is what keeps typing off the document's size: re-recording every
        // node on every keystroke cost a 4000-paragraph document eight thousand
        // map writes per character.
        //
        // Node views are the exception. They hold a position of their own and
        // are told when it moves, so a mounted view inside a skipped subtree
        // would keep reporting where it used to be — and a node view that
        // reports a stale position edits the wrong part of the document. When
        // any view is mounted the subtree is walked as before; the fast path is
        // for the ordinary document, which is most of them.
        if (
          !this.nodeViews.empty ||
          !this.positionUnchanged(newChild, dom, contentStart + offset)
        ) {
          this.recordNode(newChild, dom, contentStart + offset)
        }
        offset += newChild.nodeSize
        continue
      }

      // A view is offered the change whenever the type still matches, even if
      // the attributes moved. `sameMarkup` compares attributes too, so ticking
      // a checkbox used to tear the item's DOM out and build it again — which
      // made `update` a hook that could never fire for the thing it exists for,
      // and cost a rebuild per tick on a list with a hundred items.
      const owned = dom.nodeType === 1 && this.nodeViews.owns(dom)
      const patchable = owned ? oldChild.type === newChild.type : oldChild.sameMarkup(newChild)

      if (patchable && !newChild.isText && dom.nodeType === 1) {
        const updated = this.nodeViews.update(dom, newChild, contentStart + offset)
        if (updated) {
          const contentDOM = this.contentOf(dom)
          this.map.record(contentDOM, contentStart + offset + 1)
          this.patchFragment(
            contentDOM as HTMLElement,
            oldChild,
            newChild,
            contentStart + offset + 1,
          )
          offset += newChild.nodeSize
          continue
        }
      }

      this.nodeViews.destroyWithin(dom)
      const replacement = this.buildNode(newChild, contentStart + offset)
      target.replaceChild(replacement, dom)
      offset += newChild.nodeSize
    }
  }

  /**
   * The first child the edit could have reached, and its offset.
   *
   * Falls back to the whole fragment whenever anything makes narrowing unsafe:
   * no known edit span, a changed child count (which shifts every later child's
   * DOM), or a mounted node view (which caches a position of its own and has to
   * be told when it moves).
   */
  private editWindow(
    oldChildren: Fragment,
    newChildren: Fragment,
    contentStart: number,
  ): { from: number; offset: number } {
    const whole = { from: 0, offset: 0 }
    const dirty = this.dirty
    if (!dirty) return whole
    if (!this.nodeViews.empty) return whole
    if (oldChildren.childCount !== newChildren.childCount) return whole

    const local = dirty.from - contentStart
    if (local <= 0) return whole
    if (local > newChildren.size) return whole

    const { index, offset } = newChildren.findIndex(local)
    // Step back one: an edit at a child's very first position belongs to it,
    // and findIndex answers with the child that starts at or after the point.
    const from = Math.max(0, index - 1)
    if (from === 0) return whole
    // findIndex already gave the offset of `index`, so the one before it is
    // that minus its size — walking back from zero would be the very cost this
    // is here to avoid.
    return { from, offset: offset - newChildren.child(from).nodeSize }
  }

  /** Did the edit leave this span completely alone? */
  private untouched(from: number, size: number): boolean {
    const dirty = this.dirty
    if (!dirty) return false
    // Touching the border counts as touching it: a node that gained or lost
    // content at its very edge still has to be looked at.
    return from + size < dirty.from || from > dirty.to
  }

  /**
   * Is this node already recorded at exactly this position?
   *
   * Only meaningful next to node identity: the same node object at the same
   * position has an unchanged interior, so the whole subtree can be skipped.
   */
  private positionUnchanged(node: Node, dom: globalThis.Node, pos: number): boolean {
    if (node.isText || dom.nodeType !== 1) return true
    return this.map.contentStart(this.contentOf(dom)) === pos + 1
  }

  /** Re-register positions for a subtree whose DOM was left untouched. */
  private recordNode(node: Node, dom: globalThis.Node, pos: number): void {
    if (node.isText || dom.nodeType !== 1) return
    this.nodeViews.reposition(dom, pos)
    const contentDOM = this.contentOf(dom)
    this.map.record(contentDOM, pos + 1)
    this.recordWithin(node.content, contentDOM, pos + 1)
  }

  private recordWithin(fragment: Fragment, target: HTMLElement, start: number): void {
    let index = 0
    for (const [child, offset] of fragment.entries()) {
      const dom = target.childNodes[index]
      if (dom) this.recordNode(child, dom, start + offset)
      index++
    }
  }
}

function applyAttrs(dom: HTMLElement, attrs: Record<string, string>): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (name === 'class') {
      for (const cls of String(value).split(/\s+/)) if (cls) dom.classList.add(cls)
      continue
    }
    if (name === 'style') {
      dom.setAttribute('style', String(value).replace(/expression\s*\(|javascript:/gi, ''))
      continue
    }
    setSafeAttribute(dom, name, value)
  }
  finalizeElement(dom)
}

/** Do two sets draw the same thing over this range? */
function sameOver(a: DecorationSet, b: DecorationSet, from: number, to: number): boolean {
  const left = a.find(from, to)
  const right = b.find(from, to)
  if (left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index] as Decoration
    if (item.type !== other.type) return false
    if (item.type === 'widget' || other.type === 'widget') {
      return (
        item.type === 'widget' &&
        other.type === 'widget' &&
        item.pos === other.pos &&
        item.key === other.key
      )
    }
    // Position is not the whole of a decoration. A cursor that changes colour
    // in place, or a highlight that swaps its class, sits at the same offsets
    // and still has to be redrawn.
    return (
      item.from === other.from && item.to === other.to && sameAttrs(item.attrs, other.attrs)
    )
  })
}

function sameAttrs(a: Record<string, string>, b: Record<string, string>): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every((key) => a[key] === b[key])
}

export function renderSpec(spec: DOMOutputSpec): {
  dom: HTMLElement
  hole: globalThis.Node | null
} {
  if (typeof spec === 'string') return { dom: document.createElement(spec), hole: null }

  // Indexed rather than destructured: `[tag, ...rest]` allocates a second array
  // for every element on the page, and `rest.slice(start)` allocates a third.
  // A spec is usually two entries long and there is one per node.
  const dom = document.createElement(spec[0] as string)
  let hole: globalThis.Node | null = null
  let start = 1

  const first = spec[1]
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    for (const [name, value] of Object.entries(first as Record<string, unknown>)) {
      setSafeAttribute(dom, name, value)
    }
    finalizeElement(dom)
    start = 2
  }

  for (let i = start; i < spec.length; i++) {
    const child = spec[i]
    if (child === 0) {
      hole = dom
      continue
    }
    const rendered = renderSpec(child as DOMOutputSpec)
    dom.appendChild(rendered.dom)
    if (rendered.hole) hole = rendered.hole
  }

  return { dom, hole }
}

/**
 * Give an empty paragraph something to stand on.
 *
 * A textblock with no content renders as an element with no children, which
 * collapses to zero height and gives the caret nowhere to sit. Press Enter and
 * nothing appears to happen until you type — the block is there, it just has no
 * height. Every browser wants a `<br>` in an empty editable block, and this is
 * the one place that can know a block is empty.
 *
 * The break is marked so the parser can ignore it: it is scaffolding, not
 * content, and reading it back as a hard break would insert a real one.
 */
function fillEmptyTextblock(target: HTMLElement, node: Node): void {
  if (!node.isTextblock || node.content.size > 0) return
  if (target.firstChild) return
  const filler = document.createElement('br')
  filler.setAttribute('data-matra-filler', '')
  target.appendChild(filler)
}
