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
    // Enough edits have piled up that replaying them costs more than starting
    // over, so the next patch re-records everything and resets the backlog.
    const canPatch = this.previous !== null && this.root === target && !this.map.stale
    // Only a full rebuild may drop the index: on a patch, entries for subtrees
    // that kept their position are the ones deliberately not rewritten.
    if (!canPatch) this.map.clear()
    this.root = target
    this.map.record(target, 0)

    if (!canPatch) {
      this.nodeViews.destroyAll()
      target.replaceChildren()
      this.buildFragment(doc.content, target, 0)
    } else {
      this.patchFragment(target, this.previous as Node, doc, 0)
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

  private buildFragment(fragment: Fragment, target: HTMLElement, start: number): void {
    let openMarks: Mark[] = []
    let openTargets: HTMLElement[] = [target]

    for (const [child, offset] of fragment.entries()) {
      let keep = 0
      while (
        keep < openMarks.length &&
        keep < child.marks.length &&
        (openMarks[keep] as Mark).eq(child.marks[keep] as Mark)
      ) {
        keep++
      }
      openMarks = openMarks.slice(0, keep)
      openTargets = openTargets.slice(0, keep + 1)

      for (const mark of child.marks.slice(keep)) {
        const spec = this.schema.marks[mark.type.name]?.spec
        const rendered = spec?.toDOM
          ? renderSpec(spec.toDOM(mark) as DOMOutputSpec)
          : { dom: document.createElement('span'), hole: null }
        ;(openTargets[openTargets.length - 1] as HTMLElement).appendChild(rendered.dom)
        openMarks.push(mark)
        openTargets.push((rendered.hole ?? rendered.dom) as HTMLElement)
      }

      const parent = openTargets[openTargets.length - 1] as HTMLElement
      const pos = start + offset
      this.insertWidgets(parent, pos)

      if (child.isText) {
        for (const piece of this.buildDecoratedText(child, pos)) parent.appendChild(piece)
        continue
      }
      parent.appendChild(this.decorate(this.buildNode(child, pos), child, pos))
    }

    // Widgets sitting at the very end of the fragment.
    this.insertWidgets(target, start + fragment.size)
  }

  private insertWidgets(target: HTMLElement, pos: number): void {
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
        this.buildFragment(node.content, view.contentDOM as HTMLElement, pos + 1)
      }
      return view.dom
    }

    const spec = node.type.spec
    if (!spec.toDOM) {
      throw new Error(`Matra: node "${node.type.name}" has no toDOM, so it cannot be rendered`)
    }
    const { dom, hole } = renderSpec(spec.toDOM(node))
    if (hole && !node.type.isLeaf) {
      this.map.record(hole, pos + 1)
      this.buildFragment(node.content, hole as HTMLElement, pos + 1)
    }
    return dom
  }

  // --- patching ------------------------------------------------------------

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
      } else {
        this.recordWithin(newChildren, target, contentStart)
      }
      return
    }

    const count = Math.max(oldChildren.childCount, newChildren.childCount)
    let offset = 0

    for (let i = 0; i < count; i++) {
      const oldChild = i < oldChildren.childCount ? oldChildren.child(i) : null
      const newChild = i < newChildren.childCount ? newChildren.child(i) : null
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

      // Outside the edit entirely: same node, same DOM, and the position map
      // already accounts for the shift. There is nothing to ask about, so the
      // loop just steps over it. This is what makes a keystroke cost the size
      // of the paragraph rather than the size of the document.
      if (
        oldChild === newChild &&
        this.nodeViews.empty &&
        this.untouched(contentStart + offset, newChild.nodeSize)
      ) {
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

      if (oldChild.sameMarkup(newChild) && !newChild.isText && dom.nodeType === 1) {
        const updated = this.nodeViews.update(dom, newChild, contentStart + offset)
        if (updated) {
          const contentDOM = this.nodeViews.contentDOM(dom) ?? (dom as HTMLElement)
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
    const contentDOM = this.nodeViews.contentDOM(dom) ?? dom
    return this.map.contentStart(contentDOM) === pos + 1
  }

  /** Re-register positions for a subtree whose DOM was left untouched. */
  private recordNode(node: Node, dom: globalThis.Node, pos: number): void {
    if (node.isText || dom.nodeType !== 1) return
    this.nodeViews.reposition(dom, pos)
    const contentDOM = this.nodeViews.contentDOM(dom) ?? dom
    this.map.record(contentDOM, pos + 1)
    this.recordWithin(node.content, contentDOM as HTMLElement, pos + 1)
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

  const [tag, ...rest] = spec
  const dom = document.createElement(tag)
  let hole: globalThis.Node | null = null
  let start = 0

  const first = rest[0]
  if (first && typeof first === 'object' && !Array.isArray(first)) {
    for (const [name, value] of Object.entries(first as Record<string, unknown>)) {
      setSafeAttribute(dom, name, value)
    }
    finalizeElement(dom)
    start = 1
  }

  for (const child of rest.slice(start)) {
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
