import type { Editor, ExtensionDef, Pos } from '../types'

export interface TrailingNodeOptions {
  /** The node kept at the end. Default `paragraph`. */
  node?: string
}

/**
 * Always a paragraph at the end of the document.
 *
 * A document that ends in a table, an image or a code block has nowhere to
 * put a caret after it, and the only way to write below it is to know the
 * trick. So whenever the last block is anything else, an empty paragraph is
 * added after it — its own transaction, grouped by undo with whatever caused
 * it.
 */
export function trailingNode(options: TrailingNodeOptions = {}): ExtensionDef {
  const type = options.node ?? 'paragraph'
  const ensure = (editor: Editor) => {
    const doc = editor.unsafe.state as {
      doc: { lastChild: { type: { name: string } } | null; content: { size: number } }
    }
    const last = doc.doc.lastChild
    if (!last || last.type.name === type) return
    editor.commands.insert({ type }, doc.doc.content.size as Pos)
  }
  return {
    kind: 'extension',
    name: 'trailingNode',
    onCreate: ensure,
    onChange: ensure,
  }
}
