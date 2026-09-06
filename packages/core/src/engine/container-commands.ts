import { Fragment, type Node, type NodeType } from './model'
import type { Transaction } from './state'

/**
 * Leave a block container by pressing Enter on an empty line inside it.
 *
 * Every container that holds `block+` has the same trap: once you are inside a
 * quote, Enter makes another paragraph inside the quote, and there is no key
 * that gets you out. The writer's instinct — press Enter twice, the way every
 * list in every editor behaves — instead grows the quote forever.
 *
 * Lists already solved this in `splitListItem`: an empty item means the writer
 * is finished with the list. This is the same rule for the containers that are
 * not lists, kept in one place so a new container gets the behaviour by
 * binding a key rather than by reimplementing the check.
 *
 * `liftTarget` cannot do the work here. It refuses a range that does not cover
 * the whole wrapper, and the empty last line never does — there is content
 * above it. So the container is rebuilt without its final child and the empty
 * block is placed after it, which is the shape `unwrapItems` produces for a
 * top-level list.
 *
 * Returns false — leaving the key to whatever is bound behind it — unless all
 * of these hold, because each one is a case where exiting would be wrong:
 *
 *   - the selection is a caret, not a range (Enter over a selection replaces it)
 *   - the cursor sits in an empty textblock (there is text to split otherwise)
 *   - that block is the *last* child (Enter in the middle should split, not escape)
 *   - the container is somewhere above the cursor
 */
export function exitContainerOnEmpty(tr: Transaction, container: NodeType): boolean {
  const { $from } = tr.selection
  if (!tr.selection.empty) return false

  const block = $from.parent
  if (!block.isTextblock || block.content.size !== 0) return false

  let depth = -1
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === container) {
      depth = d
      break
    }
  }
  if (depth === -1) return false

  // The empty block has to be the last thing in the container. Escaping from
  // the middle would leave the text below it stranded in a quote the writer
  // was trying to leave, which is a worse surprise than the one being fixed.
  const node = $from.node(depth)
  const last = node.childCount - 1
  if ($from.index(depth) !== last) return false

  const start = $from.before(depth)
  const end = start + node.nodeSize
  const kept = node.content.cut(0, node.content.offsetAt(last))

  const out: Node[] = []
  // A container holding nothing but the empty line goes with it. Leaving an
  // empty quote behind would put a stray bar on the page.
  if (kept.childCount > 0) out.push(node.copy(kept))
  out.push(block)

  tr.replaceWith(start, end, Fragment.from(out))
  // The caret follows the block it was already in: one step past the opening
  // token of the paragraph now standing outside the container.
  const head = out.length > 1 ? (out[0] as Node).nodeSize : 0
  tr.selectAt(start + head + 1)
  return true
}
