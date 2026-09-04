import { engine } from '../internal'
import type { DecorationSpec, ExtensionDef, Pos } from '../types'

export interface PlaceholderOptions {
  text: string
  /**
   * Also prompt inside an empty block the caret is in, not just an empty
   * document — the way a Notion-style page hints at every new line.
   */
  everyBlock?: boolean
}

/** What the document looks like to something that only needs to know if it is blank. */
interface Blankable {
  readonly text?: string
  readonly content: { readonly content: readonly Blankable[] }
}

/**
 * Is there any text at all?
 *
 * Stops at the first character it finds. `getText()` built the whole
 * document's text to compare its trimmed length with zero, which on a long
 * document made every keystroke pay for a placeholder that was never shown.
 */
function isBlank(node: Blankable): boolean {
  if (node.text !== undefined) return node.text.trim().length === 0
  const children = node.content.content
  for (let i = 0; i < children.length; i++) {
    if (!isBlank(children[i] as Blankable)) return false
  }
  return true
}

/**
 * Prompt text for an empty editor.
 *
 * Implemented as a data attribute on the editable element plus a CSS rule,
 * rather than a fake node in the document — a placeholder that lives in the
 * document is one a user can select, copy and accidentally save.
 */
export function placeholder(options: PlaceholderOptions): ExtensionDef<Record<string, never>> {
  const update = (editor: { unsafe: { view: unknown; state: unknown } }) => {
    const view = editor.unsafe.view as { dom?: HTMLElement } | null
    const dom = view?.dom
    if (!dom) return
    const empty = isBlank((editor.unsafe.state as { doc: Blankable }).doc)
    if (empty) {
      dom.setAttribute('data-placeholder', options.text)
      dom.classList.add('matra-empty')
    } else {
      dom.removeAttribute('data-placeholder')
      dom.classList.remove('matra-empty')
    }
  }

  return {
    kind: 'extension',
    name: 'placeholder',
    onCreate: (editor) => update(editor),
    onChange: (editor) => update(editor),
    decorations: options.everyBlock
      ? (ctx) => {
          const { state } = engine(ctx)
          const $from = state.selection.$from
          const block = $from.parent
          // The whole document being empty is the root placeholder's job;
          // showing both would say the same thing twice, one on top of the other.
          if (!block.isTextblock || block.content.size !== 0 || isBlank(state.doc)) return []
          const spec: DecorationSpec = {
            type: 'node',
            from: $from.before($from.depth) as Pos,
            to: $from.after($from.depth) as Pos,
            attrs: { 'data-placeholder': options.text, class: 'matra-empty-block' },
          }
          return [spec]
        }
      : undefined,
  }
}

/** The CSS a host application needs for the placeholder to be visible. */
export const placeholderCSS = `
.matra-empty::before,
.matra-empty-block::before {
  content: attr(data-placeholder);
  color: var(--matra-placeholder, #8a8a8a);
  pointer-events: none;
  position: absolute;
}
`
