import type { Node } from '../engine/model'
import { NodeSelection, type Selection } from '../engine/state'
import { engine } from '../internal'
import type { Command, DocNode, NodeDef, NodeViewFactory } from '../types'

export interface MathOptions {
  /**
   * Draw a formula into an element.
   *
   * KaTeX, MathJax or anything else: `element` is empty and yours to fill, and
   * `display` says whether the formula stands on its own line. Left off, the
   * source is shown in a `<code>`. A renderer that throws is caught and the
   * source shown instead, so a formula a library cannot parse is still there
   * to be fixed rather than gone.
   */
  render?: (latex: string, element: HTMLElement, display: boolean) => void
}

const INLINE = 'mathInline'
const BLOCK = 'mathBlock'
const MAX_LENGTH = 2000

/** The C0 controls other than tab, newline and return; and delete. */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if ((code < 0x20 && code !== 9 && code !== 10 && code !== 13) || code === 0x7f) return true
  }
  return false
}

/**
 * Something worth storing as a formula.
 *
 * The source is text and lands in an attribute, so the real limit is size —
 * but a formula made of control characters is nobody's formula, and one that
 * is all whitespace renders as nothing and can never be clicked on again.
 */
function isLatex(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_LENGTH &&
    value.trim().length > 0 &&
    !hasControl(value)
  )
}

const source = (node: DocNode): string => String(node.attrs?.latex ?? '')

const isMath = (node: Node): boolean => node.type.name === INLINE || node.type.name === BLOCK

const readLatex = (dom: Element | string): { latex: string } | false => {
  const latex = typeof dom === 'string' ? null : dom.getAttribute('data-math')
  return isLatex(latex) ? { latex } : false
}

/**
 * The view both nodes share: the element `toDOM` would make, drawn into by
 * the renderer when there is one. Redrawn only when the source changes, so a
 * caret moving past a formula never re-typesets it.
 */
function mathView(
  name: string,
  tag: 'span' | 'div',
  className: string,
  display: boolean,
  render: MathOptions['render'],
): NodeViewFactory {
  return ({ node }) => {
    const dom = document.createElement(tag)
    dom.className = className
    dom.setAttribute('contenteditable', 'false')
    let latex = ''

    const draw = (next: string) => {
      latex = next
      dom.setAttribute('data-math', next)
      dom.replaceChildren()
      if (render) {
        try {
          render(next, dom, display)
          return
        } catch {
          // A renderer that cannot draw this formula is not a reason to lose
          // it, or to take the editor down with it: the source is shown.
          dom.replaceChildren()
        }
      }
      const code = document.createElement('code')
      code.textContent = next
      dom.append(code)
    }
    draw(source(node))

    return {
      dom,
      update: (next) => {
        if (next.type !== name) return false
        const changed = source(next)
        if (changed !== latex) draw(changed)
        return true
      },
    }
  }
}

/** The formula the selection is on: selected outright, or just before the caret. */
function mathAt(selection: Selection): { pos: number; node: Node } | null {
  if (selection instanceof NodeSelection) {
    return isMath(selection.node) ? { pos: selection.from, node: selection.node } : null
  }
  if (!selection.empty) return null
  const $from = selection.$from
  const inline = $from.nodeBefore
  if (inline) return isMath(inline) ? { pos: $from.pos - inline.nodeSize, node: inline } : null
  // At the start of a block, the block before it — which is where the caret
  // lands once `$$…$$` has become a display formula.
  const depth = $from.depth
  if (depth === 0) return null
  const index = $from.index(depth - 1)
  if (index === 0) return null
  const before = $from.node(depth - 1).child(index - 1)
  return isMath(before) ? { pos: $from.before(depth) - before.nodeSize, node: before } : null
}

type InlineCommands = {
  insertInlineMath: Command<[latex: string]>
  setMath: Command<[latex: string]>
}

type BlockCommands = {
  insertBlockMath: Command<[latex: string]>
}

/**
 * A formula in the run of text.
 *
 * Only the source is stored. It is rendered into the element by whatever the
 * application supplies — the editor carries no typesetting library, and a
 * document never depends on one: the HTML keeps the source as the element's
 * text, so an export reads as `E=mc^2` with no script on the page at all.
 *
 * An atom, so the caret steps over it and backspace takes the whole thing.
 * `$E=mc^2$ ` typed into a paragraph becomes one; `setMath` rewrites the one
 * the caret is on, inline or display.
 */
export function mathInline(options: MathOptions = {}): NodeDef<InlineCommands> {
  return {
    kind: 'node',
    name: INLINE,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,
    attrs: { latex: { required: true } },
    // Above the default, so this beats any rule for a plain `span`.
    parseDOM: [{ tag: 'span[data-math]', priority: 60, getAttrs: readLatex }],
    toDOM: (node) => ['span', { 'data-math': source(node), class: 'matra-math' }, source(node)],
    nodeView: mathView(INLINE, 'span', 'matra-math', false, options.render),
    commands: {
      insertInlineMath: (ctx, latex) =>
        isLatex(latex) ? ctx.insert({ type: INLINE, attrs: { latex } }) : false,

      setMath: (ctx, latex) => {
        if (!isLatex(latex)) return false
        const { tr } = engine(ctx)
        const target = mathAt(tr.selection)
        if (!target || target.node.attrs.latex === latex) return false
        tr.setNodeAttrs(target.pos, { latex })
        return true
      },
    },
    inputRules: [
      {
        // `$…$` and then a space. The character after the opening dollar may
        // be neither a dollar nor a space, so `$$` is left to the block rule
        // and "$ 5" stays a price.
        match: /\$([^$\s][^$]*?)\$\s$/,
        handler: (ctx, match, range) => {
          const latex = match[1] ?? ''
          if (!isLatex(latex)) return false
          return ctx.replace(range, [
            { type: INLINE, attrs: { latex } },
            { type: 'text', text: match[0].slice(-1) },
          ])
        },
      },
    ],
  }
}

/**
 * A formula on a line of its own.
 *
 * The same node as `mathInline` in every way but where it sits: a block, so
 * `ctx.insert` splits the paragraph around it and `$$E=mc^2$$ ` typed at the
 * start of a paragraph replaces the paragraph with it.
 */
export function mathBlock(options: MathOptions = {}): NodeDef<BlockCommands> {
  return {
    kind: 'node',
    name: BLOCK,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    attrs: { latex: { required: true } },
    parseDOM: [{ tag: 'div[data-math]', priority: 60, getAttrs: readLatex }],
    toDOM: (node) => [
      'div',
      { 'data-math': source(node), class: 'matra-math matra-math-block' },
      source(node),
    ],
    nodeView: mathView(BLOCK, 'div', 'matra-math matra-math-block', true, options.render),
    commands: {
      insertBlockMath: (ctx, latex) =>
        isLatex(latex) ? ctx.insert({ type: BLOCK, attrs: { latex } }) : false,
    },
    inputRules: [
      {
        match: /^\$\$(.+)\$\$\s$/,
        handler: (ctx, match, range) => {
          const latex = match[1] ?? ''
          if (!isLatex(latex)) return false
          return ctx.replace(range, { type: BLOCK, attrs: { latex } })
        },
      },
    ],
  }
}

/** Both nodes, sharing one renderer. */
export function mathKit(
  options: MathOptions = {},
): readonly [NodeDef<InlineCommands>, NodeDef<BlockCommands>] {
  return [mathInline(options), mathBlock(options)] as const
}

/** Enough styling to tell a formula from the prose around it. */
export const mathCSS = `
.matra-math { font-family: 'Latin Modern Math', 'STIX Two Math', 'Cambria Math', Cambria, Georgia, serif; font-style: normal; white-space: nowrap; }
.matra-math code { font: inherit; background: none; padding: 0; }
.matra-math-block { display: block; text-align: center; margin: 1em 0; white-space: normal; }
`
