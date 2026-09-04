import type { Fragment } from './fragment'
import type { Mark } from './mark'
import type { Node } from './node'
import { finalizeElement, setSafeAttribute } from './safe-attrs'
import type { DOMOutputSpec, Schema } from './schema'

/**
 * Document → DOM.
 *
 * Each node and mark describes its own markup through `toDOM`, returning either
 * a tag name or `[tag, attrs?, ...children]`, where the number `0` marks the
 * hole its content goes into.
 */
export class DOMSerializer {
  constructor(private readonly schema: Schema) {}

  static fromSchema(schema: Schema): DOMSerializer {
    return new DOMSerializer(schema)
  }

  serializeFragment(
    fragment: Fragment,
    target?: HTMLElement | DocumentFragment,
  ): globalThis.Node {
    const root = target ?? document.createDocumentFragment()

    // Open mark elements are kept so adjacent text sharing a mark stays inside
    // one element rather than producing <strong>a</strong><strong>b</strong>.
    let openMarks: Mark[] = []
    let openTargets: globalThis.Node[] = [root]

    for (const child of fragment) {
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
          ? this.render(spec.toDOM(mark) as DOMOutputSpec)
          : { dom: document.createElement('span'), hole: null }
        const parent = openTargets[openTargets.length - 1] as globalThis.Node
        parent.appendChild(rendered.dom)
        openMarks.push(mark)
        openTargets.push(rendered.hole ?? rendered.dom)
      }

      const parent = openTargets[openTargets.length - 1] as globalThis.Node
      parent.appendChild(this.serializeNode(child))
    }

    return root
  }

  serializeNode(node: Node): globalThis.Node {
    if (node.isText) return document.createTextNode(node.text ?? '')

    const spec = node.type.spec
    if (!spec.toDOM) {
      throw new Error(`Matra: node "${node.type.name}" has no toDOM, so it cannot be rendered`)
    }
    const { dom, hole } = this.render(spec.toDOM(node))
    if (hole && !node.type.isLeaf) this.serializeFragment(node.content, hole as HTMLElement)
    return dom
  }

  /** Turn a spec into DOM, reporting where content belongs. */
  private render(spec: DOMOutputSpec): { dom: globalThis.Node; hole: globalThis.Node | null } {
    if (typeof spec === 'string') return { dom: document.createElement(spec), hole: null }

    const tag = spec[0] as string
    const dom = document.createElement(tag)
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
        if (hole) throw new Error(`Matra: "${tag}" declares two content holes`)
        hole = dom
        continue
      }
      if (typeof child === 'string') {
        // Text among the children, the way a mention writes its label.
        dom.appendChild(document.createTextNode(child))
        continue
      }
      const rendered = this.render(child as DOMOutputSpec)
      dom.appendChild(rendered.dom)
      if (rendered.hole) hole = rendered.hole
    }

    return { dom, hole }
  }

  /** Convenience: a fragment as an HTML string. */
  serializeHTML(fragment: Fragment): string {
    const container = document.createElement('div')
    this.serializeFragment(fragment, container)
    return container.innerHTML
  }
}
