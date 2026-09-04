import { engine } from '../internal'
import type { Command, NodeDef, Pos } from '../types'

const NAME = 'details'

/**
 * A collapsible block — a Notion toggle, an HTML `<details>`.
 *
 * Rendered as the real element, so open and closed are what the browser
 * already knows how to do. The node view keeps the document in step with the
 * disclosure triangle: clicking it writes `open` to the attribute, and an
 * `open` that arrives from elsewhere — undo, a peer, a loaded document — is
 * written back to the element.
 */
export const details = {
  kind: 'node',
  name: NAME,
  content: 'detailsSummary block+',
  group: 'block',
  attrs: { open: { default: true } },
  parseDOM: [
    {
      tag: 'details',
      getAttrs: (dom) => ({ open: (dom as Element).hasAttribute('open') }),
    },
  ],
  toDOM: (node) =>
    node.attrs?.open
      ? ['details', { open: 'open', class: 'matra-details' }, 0]
      : ['details', { class: 'matra-details' }, 0],
  nodeView: ({ node, getPos, editor }) => {
    const dom = document.createElement('details')
    dom.className = 'matra-details'
    let open = node.attrs?.open !== false
    dom.open = open

    dom.addEventListener('toggle', () => {
      // The browser toggled it. Setting `.open` from `update` fires this too,
      // so only a real change reaches the document.
      if (dom.open === open) return
      open = dom.open
      const commands = editor.commands as unknown as {
        setDetailsOpen(open: boolean, at: number): boolean
      }
      commands.setDetailsOpen(open, getPos())
    })

    return {
      dom,
      contentDOM: dom,
      update: (next) => {
        if (next.type !== NAME) return false
        const wanted = next.attrs?.open !== false
        if (wanted !== open) {
          open = wanted
          dom.open = wanted
        }
        return true
      },
    }
  },
  commands: {
    /** Wrap the block at the caret in a toggle, with an empty summary. */
    insertDetails: (ctx) => {
      const { tr, schema } = engine(ctx)
      const summaryType = schema.nodes.detailsSummary
      const detailsType = schema.nodes[NAME]
      if (!summaryType || !detailsType) return false
      const $from = tr.selection.$from
      const depth = $from.depth
      if (depth === 0) return false
      const block = $from.node(depth)
      if (!block.isBlock) return false
      const start = $from.before(depth)
      const end = $from.after(depth)
      const node = detailsType.createAndFill({ open: true }, [summaryType.create(), block])
      if (!node) return false
      tr.replaceWith(start, end, node)
      // Into the summary, ready to type its title.
      tr.selectAt(start + 2)
      return true
    },

    /** Open or close the toggle the caret is in. */
    toggleDetails: (ctx) => {
      if (!ctx.inNode(NAME)) return false
      const open = ctx.inNode(NAME, { open: true })
      return ctx.setNodeAttrs(NAME, { open: !open })
    },

    setDetailsOpen: (ctx, open, at) => ctx.setNodeAttrs(NAME, { open: open !== false }, at),

    /** Take the toggle away and leave its summary as a paragraph above its content. */
    unsetDetails: (ctx) => {
      const { tr, schema } = engine(ctx)
      const paragraph = schema.nodes.paragraph
      if (!paragraph) return false
      const $from = tr.selection.$from
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth)
        if (node.type.name !== NAME) continue
        const summary = node.firstChild
        const blocks: Array<typeof node> = []
        if (summary?.content.size) blocks.push(paragraph.create(null, summary.content))
        for (let i = 1; i < node.childCount; i++) blocks.push(node.child(i))
        tr.replaceWith($from.before(depth), $from.after(depth), blocks)
        return true
      }
      return false
    },
  },
  keys: {
    // Enter in the summary moves into the content, rather than splitting the
    // title in two.
    Enter: (ctx) => {
      const { tr } = engine(ctx)
      const $from = tr.selection.$from
      if ($from.parent.type.name !== 'detailsSummary') return false
      tr.selectAt($from.after($from.depth) + 1)
      return true
    },
  },
} satisfies NodeDef<{
  insertDetails: Command
  toggleDetails: Command
  setDetailsOpen: Command<[open: boolean, at?: Pos]>
  unsetDetails: Command
}>

/** The title line of a toggle. */
export const detailsSummary = {
  kind: 'node',
  name: 'detailsSummary' as const,
  content: 'inline*',
  parseDOM: [{ tag: 'summary' }],
  toDOM: () => ['summary', 0],
} satisfies NodeDef

/** Both nodes, in the order a schema wants them. */
export const detailsKit = [details, detailsSummary] as const

export const detailsCSS = `
.matra-details { border: 1px solid var(--matra-details-border, #d9d9d9); border-radius: 6px; padding: 0.25em 0.75em; }
.matra-details > summary { cursor: pointer; font-weight: 600; }
.matra-details > summary:empty::after { content: 'Untitled'; opacity: 0.4; }
`
