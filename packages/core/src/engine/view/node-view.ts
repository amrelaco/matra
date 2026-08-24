import type { Node } from '../model/node'

/** What a node view hands back to the editor. */
export interface NodeViewSpec {
  /** The outer element standing in for the node. */
  dom: HTMLElement
  /** Where child content renders. Omit for an atom that owns its inside. */
  contentDOM?: HTMLElement | null
  /**
   * Called when the node changed but kept its type.
   *
   * Return false to say the view cannot represent the new node, and the editor
   * will rebuild it — which is the honest answer when attributes change in a
   * way the view did not plan for.
   */
  update?(node: Node): boolean
  destroy?(): void
  /** Return true to keep the editor's hands off an event inside your UI. */
  stopEvent?(event: Event): boolean
}

export interface NodeViewProps {
  node: Node
  /** Where this node currently starts. Valid at call time, not later. */
  getPos(): number
}

export type NodeViewFactory = (props: NodeViewProps) => NodeViewSpec

export interface NodeViewHost {
  /** Factories by node type name. */
  factories: Record<string, NodeViewFactory>
}

interface Live {
  spec: NodeViewSpec
  node: Node
  pos: number
}

/**
 * Node view lifecycle.
 *
 * A node view is a bit of the document rendered by application code — a table
 * with its own resize handles, an embed, an image with a caption editor. The
 * editor must therefore not casually throw its DOM away, because that DOM may
 * hold focus, scroll position or a half-finished interaction.
 */
export class NodeViewManager {
  private readonly live = new Map<globalThis.Node, Live>()

  constructor(private readonly host?: NodeViewHost) {}

  get enabled(): boolean {
    return Boolean(this.host && Object.keys(this.host.factories).length)
  }

  /** Build a view for this node, or null when no factory claims its type. */
  create(node: Node, pos: number): NodeViewSpec | null {
    const factory = this.host?.factories[node.type.name]
    if (!factory) return null

    // getPos is read at call time so a view always asks rather than caching.
    let current = pos
    const spec = factory({ node, getPos: () => current })
    this.live.set(spec.dom, { spec, node, pos })
    // Keep the recorded position fresh as the document moves.
    Object.defineProperty(spec.dom, '__matraSetPos', {
      value: (next: number) => {
        current = next
      },
      enumerable: false,
      configurable: true,
    })
    return spec
  }

  /** Tell an existing view its node changed. False means rebuild it. */
  update(dom: globalThis.Node, node: Node, pos: number): boolean {
    const entry = this.live.get(dom)
    if (!entry) return true // not a node view; ordinary DOM can be reused

    const setPos = (dom as unknown as { __matraSetPos?: (n: number) => void }).__matraSetPos
    setPos?.(pos)

    if (entry.spec.update && !entry.spec.update(node)) return false
    entry.node = node
    entry.pos = pos
    return true
  }

  /**
   * Tell a view where it now sits.
   *
   * Needed for nodes whose DOM was reused untouched: nothing about them
   * changed, but everything before them may have moved, and a view that
   * reports a stale position will edit the wrong part of the document.
   */
  reposition(dom: globalThis.Node, pos: number): void {
    const entry = this.live.get(dom)
    if (!entry) return
    entry.pos = pos
    ;(dom as unknown as { __matraSetPos?: (n: number) => void }).__matraSetPos?.(pos)
  }

  contentDOM(dom: globalThis.Node): globalThis.Node | null {
    return this.live.get(dom)?.spec.contentDOM ?? null
  }

  /** Does this element belong to a view that wants to keep the event? */
  stopsEvent(target: globalThis.Node | null, event: Event): boolean {
    let node: globalThis.Node | null = target
    while (node) {
      const entry = this.live.get(node)
      if (entry?.spec.stopEvent?.(event)) return true
      node = node.parentNode
    }
    return false
  }

  /** Destroy every view inside (and including) this DOM node. */
  destroyWithin(dom: globalThis.Node): void {
    if (!this.live.size) return
    for (const [element, entry] of [...this.live]) {
      if (element !== dom && !dom.contains(element)) continue
      entry.spec.destroy?.()
      this.live.delete(element)
    }
  }

  destroyAll(): void {
    for (const entry of this.live.values()) entry.spec.destroy?.()
    this.live.clear()
  }
}
