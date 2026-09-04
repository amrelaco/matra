import { Fragment } from '../model/fragment'
import type { Node } from '../model/node'
import type { ResolvedPos } from '../model/resolved-pos'
import { accepts } from './structure'
import type { Transform } from './transform'

/** Runs of inline nodes become textblocks like `like`, so a mixed list is all blocks. */
function wrapRuns(nodes: readonly Node[], like: Node): Node[] {
  const out: Node[] = []
  let run: Node[] = []
  const flush = () => {
    if (run.length) out.push(like.copy(Fragment.from(run)))
    run = []
  }
  for (const node of nodes) {
    if (node.isInline) run.push(node)
    else {
      flush()
      out.push(node)
    }
  }
  flush()
  return out
}

/**
 * Split the textblock around `$from`..`$to` and put `nodes` in the gap.
 *
 * Without `merge`, the blocks stand between the two halves of the paragraph:
 * what a rule or a table asked for at the caret means. With it, a leading
 * textblock joins the half before the caret and a trailing one the half
 * after, so pasting two paragraphs into a third gives three, and pasting one
 * gives the sentence with the words in it. A half that is the whole paragraph
 * is the paragraph itself, same object, so blocks put beside it never count
 * as a change to it. When nothing follows, an empty paragraph is left so
 * there is somewhere to keep typing — unless the last thing pasted was a
 * paragraph, in which case the caret belongs at the end of that.
 *
 * Returns where the caret should go, or null when the parent refuses the
 * result — a list item that would hold a table, say.
 */
function place(
  tr: Transform,
  $from: ResolvedPos,
  $to: ResolvedPos,
  nodes: readonly Node[],
  merge: boolean,
): number | null {
  const parent = $from.parent
  const depth = $from.depth
  const whole = parent.content.size
  let head = parent.content.cut(0, $from.parentOffset)
  let tail = parent.content.cut($to.parentOffset)
  const list = [...nodes]
  let mergedHead = false
  let mergedTail: Node | null = null
  if (merge) {
    const first = list[0]
    if (first?.isTextblock) {
      head = head.append(first.content)
      list.shift()
      mergedHead = true
    }
    const last = list[list.length - 1]
    if (last?.isTextblock && tail.size > 0) {
      tail = last.content.append(tail)
      list.pop()
      mergedTail = last
    }
  }

  const out: Node[] = []
  let landing = 0
  if (list.length === 0) {
    out.push(parent.copy(head.append(tail)))
    landing = 1 + head.size
  } else {
    if (head.size > 0) out.push(!mergedHead && head.size === whole ? parent : parent.copy(head))
    for (const node of merge ? wrapRuns(list, parent) : list) out.push(node)
    for (const node of out) landing += node.nodeSize
    if (mergedTail) {
      out.push(parent.copy(tail))
      landing += 1 + mergedTail.content.size
    } else if (tail.size > 0) {
      out.push(tail.size === whole ? parent : parent.copy(tail))
    } else if (merge && (out[out.length - 1] as Node).isTextblock) {
      landing -= 1
    } else {
      out.push(parent.copy(tail))
    }
  }

  const start = $from.before(depth)
  const end = $from.after(depth)
  if (!accepts($from.node(depth - 1), $from.start(depth - 1), start, end, out)) return null
  tr.replaceWith(start, end, out)
  return start + landing
}

/**
 * Put blocks where the caret is, by splitting the textblock around them.
 *
 * A rule or a table cannot go inside a paragraph, and asking for one at a
 * caret in the middle of a sentence used to be refused outright — which is
 * what the toolbar's "rule" button and the `---` shortcut both ask for.
 * Returns where the caret should go, or null when the range is not inside
 * one textblock or the nodes are not all blocks, so the plain path can have
 * its turn.
 */
export function insertBlocks(
  tr: Transform,
  from: number,
  to: number,
  nodes: readonly Node[],
): number | null {
  if (!nodes.length || !nodes.every((node) => node.isBlock)) return null
  const $from = tr.doc.resolve(from)
  const $to = tr.doc.resolve(to)
  if ($to.parent !== $from.parent || !$from.parent.isTextblock || $from.depth === 0) return null
  return place(tr, $from, $to, nodes, false)
}

/**
 * Put pasted content where the caret is, the way a person expects.
 *
 * Text that is all inline goes into the sentence. Blocks split the paragraph
 * around them. Paragraphs do both: the first one joins what is before the
 * caret, the last one joins what is after, and the ones between stand on
 * their own. At a boundary between blocks, everything lands as blocks.
 * Returns where the caret should go, or null when the document cannot hold
 * what was pasted there at all.
 */
export function insertPasted(
  tr: Transform,
  from: number,
  to: number,
  fragment: Fragment,
): number | null {
  let nodes: Node[] = [...fragment.content]
  if (!nodes.length) return null
  const doc = tr.doc
  const paragraph = doc.type.schema.nodes.paragraph
  const $from = doc.resolve(from)
  const $to = doc.resolve(to)
  const inTextblock = $to.parent === $from.parent && $from.parent.isTextblock && $from.depth > 0

  if (nodes.every((node) => node.isInline)) {
    if (inTextblock) {
      try {
        tr.replaceWith(from, to, fragment)
        return from + fragment.size
      } catch {
        return null
      }
    }
    if (!paragraph) return null
    nodes = [paragraph.create(null, fragment)]
  }

  if (inTextblock) return place(tr, $from, $to, nodes, true)

  const blocks = paragraph ? wrapRuns(nodes, paragraph.create()) : nodes
  try {
    tr.replaceWith(from, to, blocks)
    let size = 0
    for (const node of blocks) size += node.nodeSize
    return from + size
  } catch {
    return null
  }
}
