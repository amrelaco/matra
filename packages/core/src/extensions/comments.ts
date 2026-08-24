import type { Command, DocNode, MarkDef } from '../types'

export interface CommentRange {
  threadId: string
  from: number
  to: number
  /** The text the thread is attached to, as it reads right now. */
  text: string
}

/**
 * Threaded comments, anchored to ranges.
 *
 * The thread itself — author, body, replies, resolution — belongs to the host
 * application, not the document. All that lives here is the anchor: a mark
 * carrying a thread id. That separation is deliberate. Comment bodies in the
 * document would travel with every copy, paste and export of the text, and
 * would need migrating whenever the comment schema changed.
 *
 * Because the anchor is a mark, position mapping keeps it correct for free:
 * edit the paragraph around a comment and the highlight follows the words.
 */
export const comment: MarkDef<{
  addComment: Command<[threadId: string]>
  removeComment: Command<[threadId: string]>
}> = {
  kind: 'mark',
  name: 'comment',
  // Comments overlap: two people may comment on overlapping spans, and a span
  // may carry several threads. An empty excludes rule allows that.
  excludes: '',
  inclusive: false,
  attrs: { threadId: { required: true } },
  parseDOM: [
    {
      tag: 'span[data-comment]',
      getAttrs: (dom) => {
        const threadId = (dom as Element).getAttribute('data-comment')
        return threadId ? { threadId } : false
      },
    },
  ],
  toDOM: (mark) => [
    'span',
    { 'data-comment': mark.attrs?.threadId, class: 'matra-comment' },
    0,
  ],
  commands: {
    addComment: (ctx, threadId) => {
      if (!threadId) return false
      // A comment needs something to point at.
      if (ctx.selection.empty) return false
      return ctx.addMark('comment', { threadId })
    },
    removeComment: (ctx, threadId) => {
      const ranges = commentRanges(ctx.doc).filter((range) => range.threadId === threadId)
      if (!ranges.length) return false
      let removed = false
      // Later first, so earlier positions stay valid. The threadId narrows the
      // removal to this thread, leaving any overlapping ones intact.
      for (const range of ranges.reverse()) {
        removed =
          ctx.removeMark(
            'comment',
            { from: range.from as never, to: range.to as never },
            { threadId },
          ) || removed
      }
      return removed
    },
  },
}

/**
 * Where every comment currently sits.
 *
 * Recomputed from the document rather than cached, so it is never stale — this
 * is what a sidebar reads to draw threads beside the right paragraphs.
 */
export function commentRanges(doc: DocNode): CommentRange[] {
  const found: CommentRange[] = []

  const walk = (node: DocNode, pos: number): number => {
    if (typeof node.text === 'string') {
      const size = node.text.length
      for (const mark of node.marks ?? []) {
        if (mark.type !== 'comment') continue
        const threadId = String(mark.attrs?.threadId ?? '')
        if (!threadId) continue
        const previous = found[found.length - 1]
        // Adjacent text nodes carrying the same thread are one comment.
        if (previous && previous.threadId === threadId && previous.to === pos) {
          previous.to = pos + size
          previous.text += node.text
        } else {
          found.push({ threadId, from: pos, to: pos + size, text: node.text })
        }
      }
      return size
    }

    let inner = 0
    for (const child of node.content ?? []) inner += walk(child, pos + inner + 1)
    return node.content ? inner + 2 : 1
  }

  let offset = 0
  for (const child of doc.content ?? []) offset += walk(child, offset)
  return found
}

/** The CSS a host needs for comment highlights to be visible. */
export const commentCSS = `
.matra-comment {
  background: var(--matra-comment-bg, rgba(162, 167, 255, 0.22));
  border-bottom: 1px solid var(--matra-comment-line, #a2a7ff);
  cursor: pointer;
}
`
