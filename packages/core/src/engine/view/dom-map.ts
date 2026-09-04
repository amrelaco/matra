import type { Node } from '../model/node'
import type { Mapping, StepMap } from '../transform/step-map'

/** How many edits may pile up before replaying them costs more than rebuilding. */
const MAX_PENDING = 64

/** Where a DOM node sat, and which edit it was current as of. */
interface Entry {
  pos: number
  gen: number
}

/**
 * The bridge between model positions and the DOM.
 *
 * Rendering records where each node's DOM lives; everything else — selection,
 * input, decorations — asks this map rather than guessing from the DOM shape.
 *
 * Entries are written in the coordinates of the moment they were recorded and
 * carry the generation they belong to. Reading replays the edits since. That is
 * what keeps typing off the size of the document: rewriting every entry on
 * every keystroke made a four-thousand-paragraph document do eight thousand
 * writes per character, all to say the same thing shifted by one.
 *
 * Writes are always in current coordinates. An earlier version stored them
 * rebased backwards through an inverted mapping, which is lossy across
 * deletions and quietly produced positions that were numbers rather than
 * answers.
 */
export class DOMMap {
  private readonly starts = new WeakMap<globalThis.Node, Entry>()
  /**
   * Elements that stand for a node with no content of its own.
   *
   * A `<br>`, an `<img>`, an `<hr>`, a mention — each is one position in the
   * model and none of them is a recorded container, so counting their borders
   * gives zero and every caret position after one of them in the same block
   * comes back one short. That is not a rounding error: press Enter at the end
   * of a heading that contains a line break and the split lands one character
   * early, so the last letter of the heading walks off into the new block.
   *
   * The renderer knows which elements these are at the moment it builds them,
   * so it says so rather than leaving this to guess from the DOM shape — a
   * `<br>` the editor put there and a `<br>` holding an empty block open look
   * identical from here, and only one of them is content.
   */
  private readonly atoms = new WeakSet<globalThis.Node>()
  /** Current-coordinate position → DOM. A cache; every read is verified. */
  private readonly nodes = new Map<number, globalThis.Node>()
  /** One StepMap per edit since the last full record. */
  private maps: StepMap[] = []
  private root: globalThis.Node | null = null

  get stale(): boolean {
    return this.maps.length >= MAX_PENDING
  }

  /** Absorb an edit rather than rewriting the map for it. */
  shift(mapping: Mapping): void {
    for (const map of mapping.maps) this.maps.push(map)
  }

  record(dom: globalThis.Node, contentStart: number): void {
    if (contentStart === 0) this.root = dom
    // Reuse the entry when there is one. Re-recording is what a patch does to
    // every node whose subtree it kept, and a fresh object per node per edit is
    // garbage generated to say what the old object already said.
    const entry = this.starts.get(dom)
    if (entry) {
      entry.pos = contentStart
      entry.gen = this.maps.length
    } else {
      this.starts.set(dom, { pos: contentStart, gen: this.maps.length })
    }
    this.nodes.set(contentStart, dom)
  }

  clear(): void {
    this.nodes.clear()
    this.maps = []
    this.root = null
  }

  /**
   * Drop the backlog and start a fresh generation.
   *
   * The caller must re-record every entry immediately afterwards, in current
   * coordinates — anything left behind would be read as current when it is not.
   * This is how the backlog is cleared without throwing the rendered DOM away
   * with it.
   */
  reindex(): void {
    this.nodes.clear()
    this.maps = []
  }

  /**
   * Where this DOM node's content starts, now.
   *
   * Left bias is deliberate: typing at the very start of a paragraph inserts
   * text *at* its content start, and the content still starts where it did.
   * Right bias would shift the paragraph's coordinates and put the caret in the
   * paragraph before it.
   */
  contentStart(dom: globalThis.Node): number | undefined {
    const entry = this.starts.get(dom)
    if (entry === undefined) return undefined
    if (entry.gen === this.maps.length) return entry.pos

    let pos = entry.pos
    for (let i = entry.gen; i < this.maps.length; i++) {
      pos = (this.maps[i] as StepMap).map(pos, -1)
    }
    // Write the answer back, so the next read is a lookup rather than a replay.
    entry.pos = pos
    entry.gen = this.maps.length
    return pos
  }

  domAt(contentStart: number): globalThis.Node | undefined {
    const hit = this.nodes.get(contentStart)
    // Verify rather than trust: the cache is keyed by positions that edits move.
    if (hit && this.contentStart(hit) === contentStart) return hit
    return this.repair(contentStart)
  }

  /**
   * Find the element for a position by looking, then remember it.
   *
   * Reached when the cache is wrong, which happens after structural change
   * rather than after typing — the rare path paying for the common one.
   */
  private repair(contentStart: number): globalThis.Node | undefined {
    if (!this.root) return undefined
    const stack: globalThis.Node[] = [this.root]
    while (stack.length > 0) {
      const dom = stack.pop() as globalThis.Node
      if (this.starts.has(dom) && this.contentStart(dom) === contentStart) {
        this.nodes.set(contentStart, dom)
        return dom
      }
      for (let child = dom.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) stack.push(child)
      }
    }
    return undefined
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
      // contentStart, not the raw table: entries are held in the coordinates of
      // the last full record and only become current on the way out.
      start = this.contentStart(container)
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
      for (let child = dom.firstChild; child && !found; child = child.nextSibling) {
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
    let index = 0
    for (
      let child = container.firstChild;
      child && index < childIndex;
      child = child.nextSibling
    ) {
      total += this.modelSize(child)
      index++
    }
    return total
  }

  private sizeOfChildren(dom: globalThis.Node, childIndex: number): number {
    return this.borderSize(dom) + this.offsetOfChild(dom, childIndex)
  }

  /** What one border of this element costs in model positions. */
  private borderSize(dom: globalThis.Node): number {
    return this.starts.has(dom) ? 1 : 0
  }

  /** This element is one model position and has no insides worth counting. */
  recordAtom(dom: globalThis.Node): void {
    this.atoms.add(dom)
  }

  /** Model size of a rendered DOM node, borders included. */
  private modelSize(dom: globalThis.Node): number {
    if (dom.nodeType === 3) return dom.nodeValue?.length ?? 0
    // A leaf costs one whatever it renders as. A mention draws its own label as
    // text, and adding that text up would make a five-letter name cost five.
    if (this.atoms.has(dom)) return 1
    let inner = 0
    for (let child = dom.firstChild; child; child = child.nextSibling) {
      inner += this.modelSize(child)
    }
    return inner + this.borderSize(dom) * 2
  }

  /** DOM position for a model position. */
  domFromPos(doc: Node, pos: number): { node: globalThis.Node; offset: number } | null {
    const $pos = doc.resolve(pos)
    const parentStart = $pos.start()
    const dom = this.domAt(parentStart)
    if (!dom) return null

    let remaining = pos - parentStart
    for (let child = dom.firstChild; child; child = child.nextSibling) {
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
    for (let child = dom.firstChild; child; child = child.nextSibling) {
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
    for (let child = dom.firstChild; child; child = child.nextSibling) {
      if (remaining <= 0) break
      remaining -= this.modelSize(child)
      index++
    }
    return index
  }
}
