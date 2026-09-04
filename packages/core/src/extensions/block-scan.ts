import type { Node } from '../engine/model'

/**
 * Something computed per top-level block, remembered per block.
 *
 * Nodes are immutable, so a block that did not change is the same object it
 * was — and whatever was computed from it last time is still right. A search
 * with five hundred hits recomputes the one block a keystroke touched and
 * reads the other blocks' hits out of the cache, so the cost of keeping a
 * search open while typing is the paragraph, not the document.
 *
 * The cache is a WeakMap keyed on the node, so a block that leaves the
 * document takes its entry with it.
 */
export type BlockCache<T> = WeakMap<Node, T>

export function scanBlocks<T>(
  doc: Node,
  cache: BlockCache<T>,
  compute: (block: Node) => T,
  each: (result: T, block: Node, pos: number) => void,
): void {
  const blocks = doc.content.content
  let offset = 0
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as Node
    let result = cache.get(block)
    if (result === undefined) {
      result = compute(block)
      cache.set(block, result)
    }
    each(result, block, offset)
    offset += block.nodeSize
  }
}

/** The character standing in for an inline leaf — an image, a mention — in scanned text. */
export const OBJECT = '￼'

/**
 * A textblock's text, one character per position.
 *
 * `textContent` skips inline leaves, and a mention in a sentence would then
 * put every later match one position early. A placeholder character keeps
 * string offsets and document offsets the same thing.
 */
export function positionalText(textblock: Node): string {
  const children = textblock.content.content
  let out = ''
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as Node
    out += child.text !== undefined ? child.text : OBJECT.repeat(child.nodeSize)
  }
  return out
}

/** Every textblock inside a block, with its position relative to the block's start. */
export function textblocksIn(block: Node, fn: (textblock: Node, offset: number) => void): void {
  // A block's own text starts one position in, past its opening border.
  if (block.isTextblock) {
    fn(block, 1)
    return
  }
  block.descendants((node, pos) => {
    if (!node.isTextblock) return undefined
    fn(node, pos + 1)
    return false
  }, 1)
}
