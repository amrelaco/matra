import type { Fragment } from '../model/fragment'
import type { Mark } from '../model/mark'
import type { Node } from '../model/node'
import type { DOMOutputSpec, Schema } from '../model/schema'
import { DOMMap } from './dom-map'

/**
 * Document → DOM, recording where everything landed.
 *
 * This is the serializer plus bookkeeping: every node's DOM is registered with
 * the position map so the caret can be found again afterwards.
 */
export class Renderer {
  readonly map = new DOMMap()

  constructor(private readonly schema: Schema) {}

  /** Render a document into `target`, replacing whatever was there. */
  render(doc: Node, target: HTMLElement): void {
    this.map.clear()
    target.replaceChildren()
    this.map.record(target, 0)
    this.renderFragment(doc.content, target, 0)
  }

  private renderFragment(fragment: Fragment, target: HTMLElement, start: number): void {
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
      parent.appendChild(this.renderNode(child, start + offset))
    }
  }

  private renderNode(node: Node, pos: number): globalThis.Node {
    if (node.isText) return document.createTextNode(node.text ?? '')

    const spec = node.type.spec
    if (!spec.toDOM) {
      throw new Error(`Matra: node "${node.type.name}" has no toDOM, so it cannot be rendered`)
    }
    const { dom, hole } = renderSpec(spec.toDOM(node))

    if (hole && !node.type.isLeaf) {
      // A node's content starts one position after the node itself.
      this.map.record(hole, pos + 1)
      this.renderFragment(node.content, hole as HTMLElement, pos + 1)
    }
    return dom
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
