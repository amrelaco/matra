import type { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import type { DOMOutputSpec, Schema } from '../model/schema'
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
  private root: HTMLElement | null = null

  constructor(
    private readonly schema: Schema,
    host?: NodeViewHost,
  ) {
    this.nodeViews = new NodeViewManager(host)
  }

  render(doc: Node, target: HTMLElement): void {
    const canPatch = this.previous !== null && this.root === target
    this.map.clear()
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
      parent.appendChild(this.buildNode(child, start + offset))
    }
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
      if (!oldChildren.eq(newChildren)) {
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

      // Immutability pays here: an untouched subtree is the same object.
      if (oldChild === newChild) {
        this.recordNode(newChild, dom, contentStart + offset)
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
      if (value === null || value === undefined || value === false) continue
      dom.setAttribute(name, String(value))
    }
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
