import type { Node } from '../model/node'

/**
 * The bridge between model positions and the DOM.
 *
 * Rendering records where each node's DOM lives; everything else — selection,
 * input, decorations — asks this map rather than guessing from the DOM shape.
 */
export class DOMMap {
  /** DOM node → model position of the *start of its content*. */
  private readonly starts = new WeakMap<globalThis.Node, number>()
  /** Model position → the DOM node representing that node. */
  private readonly nodes = new Map<number, globalThis.Node>()

  record(dom: globalThis.Node, contentStart: number): void {
    this.starts.set(dom, contentStart)
    this.nodes.set(contentStart, dom)
  }

  clear(): void {
    this.nodes.clear()
  }

  contentStart(dom: globalThis.Node): number | undefined {
    return this.starts.get(dom)
  }

  domAt(contentStart: number): globalThis.Node | undefined {
    return this.nodes.get(contentStart)
  }

  /**
   * Model position for a DOM position.
   *
   * Walks up to the nearest recorded ancestor, then forward through its
   * children adding up model sizes — the DOM is the source of truth for where
   * the caret is, the model for what things cost.
   */
  posFromDOM(root: globalThis.Node, target: globalThis.Node, offset: number): number | null {
    let container: globalThis.Node | null = target
    let start: number | undefined

    while (container) {
      start = this.starts.get(container)
      if (start !== undefined) break
      container = container.parentNode
    }
    if (!container || start === undefined) return null

    // Text node: the offset is already in characters.
    if (target.nodeType === 3 && container === target.parentNode) {
      return start + this.offsetWithin(container, target, offset)
    }
    if (container === target) {
      return start + this.offsetOfChild(container, offset)
    }
    return start + this.offsetWithin(container, target, offset)
  }

  /** Model distance from the start of `container` to (`target`, `offset`). */
  private offsetWithin(
    container: globalThis.Node,
    target: globalThis.Node,
    offset: number,
  ): number {
    let total = 0
    let found = false

    const walk = (dom: globalThis.Node): void => {
      if (found) return
      for (const child of Array.from(dom.childNodes)) {
        if (found) return
        if (child === target) {
          total += child.nodeType === 3 ? offset : this.sizeOfChildren(child, offset)
          found = true
          return
        }
        if (child.nodeType === 3) {
          total += child.nodeValue?.length ?? 0
          continue
        }
        if (child.contains(target)) {
          // Descend: the border of an inline wrapper costs nothing, a block costs one.
          total += this.borderSize(child)
          walk(child)
          return
        }
        total += this.modelSize(child)
      }
    }

    walk(container)
    return total
  }

  private offsetOfChild(container: globalThis.Node, childIndex: number): number {
    let total = 0
    const children = Array.from(container.childNodes)
    for (let i = 0; i < childIndex && i < children.length; i++) {
      total += this.modelSize(children[i] as globalThis.Node)
    }
    return total
  }

  private sizeOfChildren(dom: globalThis.Node, childIndex: number): number {
    let total = this.borderSize(dom)
    const children = Array.from(dom.childNodes)
    for (let i = 0; i < childIndex && i < children.length; i++) {
      total += this.modelSize(children[i] as globalThis.Node)
    }
    return total
  }

  /** What one border of this element costs in model positions. */
  private borderSize(dom: globalThis.Node): number {
    return this.starts.has(dom) ? 1 : 0
  }

  /** Model size of a rendered DOM node, borders included. */
  private modelSize(dom: globalThis.Node): number {
    if (dom.nodeType === 3) return dom.nodeValue?.length ?? 0
    let inner = 0
    for (const child of Array.from(dom.childNodes)) inner += this.modelSize(child)
    return inner + this.borderSize(dom) * 2
  }

  /** DOM position for a model position. */
  domFromPos(doc: Node, pos: number): { node: globalThis.Node; offset: number } | null {
    const $pos = doc.resolve(pos)
    const parentStart = $pos.start()
    const dom = this.nodes.get(parentStart)
    if (!dom) return null

    let remaining = pos - parentStart
    for (const child of Array.from(dom.childNodes)) {
      const size = this.modelSize(child)
      if (remaining <= size) {
        if (child.nodeType === 3) return { node: child, offset: remaining }
        if (remaining === 0) break
        // Inside an inline wrapper such as <strong>.
        const inner = this.domFromPosWithin(child, remaining - this.borderSize(child))
        if (inner) return inner
        break
      }
      remaining -= size
    }

    const index = this.childIndexForOffset(dom, pos - parentStart)
    return { node: dom, offset: index }
  }

  private domFromPosWithin(
    dom: globalThis.Node,
    offset: number,
  ): { node: globalThis.Node; offset: number } | null {
    let remaining = offset
    for (const child of Array.from(dom.childNodes)) {
      const size = this.modelSize(child)
      if (remaining <= size) {
        if (child.nodeType === 3) return { node: child, offset: remaining }
        return this.domFromPosWithin(child, remaining - this.borderSize(child))
      }
      remaining -= size
    }
    return null
  }

  private childIndexForOffset(dom: globalThis.Node, offset: number): number {
    let remaining = offset
    let index = 0
    for (const child of Array.from(dom.childNodes)) {
      if (remaining <= 0) break
      remaining -= this.modelSize(child)
      index++
    }
    return index
  }
}
