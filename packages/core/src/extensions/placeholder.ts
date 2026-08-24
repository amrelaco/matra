import type { ExtensionDef } from '../types'

export interface PlaceholderOptions {
  text: string
  /** Show it in every empty block, not just an empty document. */
  everyBlock?: boolean
}

/**
 * Prompt text for an empty editor.
 *
 * Implemented as a data attribute on the editable element plus a CSS rule,
 * rather than a fake node in the document — a placeholder that lives in the
 * document is one a user can select, copy and accidentally save.
 */
export function placeholder(options: PlaceholderOptions): ExtensionDef<Record<string, never>> {
  const update = (editor: { getText(): string; unsafe: { view: unknown } }) => {
    const view = editor.unsafe.view as { dom?: HTMLElement } | null
    const dom = view?.dom
    if (!dom) return
    const empty = editor.getText().trim().length === 0
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
  }
}

/** The CSS a host application needs for the placeholder to be visible. */
export const placeholderCSS = `
.matra-empty::before {
  content: attr(data-placeholder);
  color: var(--matra-placeholder, #8a8a8a);
  pointer-events: none;
  position: absolute;
}
`
