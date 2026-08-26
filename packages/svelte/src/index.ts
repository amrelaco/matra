import { type AnyDef, type Editor, type EditorOptions, createEditor } from '@matrajs/core'
import { type Readable, readable } from 'svelte/store'

/**
 * Svelte bindings, which are mostly an action.
 *
 * Svelte already has the shape this needs — an action runs when the element
 * exists and is told when it goes away — so the binding is thin on purpose.
 * What it adds over eight lines written inline is the double-mount guard and a
 * store, and both of those are the parts people get wrong rather than the
 * parts they find tedious.
 *
 * Written with stores rather than runes so it works the same in Svelte 4 and
 * 5. A rune-only package would be a version boundary in exchange for nothing.
 */

/** The shape Svelte's `use:` directive expects back. */
export interface EditorAction {
  destroy(): void
}

export interface MatraAction<T extends readonly AnyDef[]> {
  /** Pass this to `use:` on the element the editor should mount into. */
  action: (node: HTMLElement) => EditorAction
  /** The editor itself. It exists before the element does. */
  editor: Editor<T>
  /** Bumped on every change and selection move · read it in your markup. */
  state: Readable<Editor<T>>
}

/**
 * Create an editor and the action that mounts it.
 *
 * ```svelte
 * <script>
 *   import { matra } from '@matrajs/svelte'
 *   import { starterKit } from '@matrajs/core'
 *
 *   const { action, editor, state } = matra({ extensions: starterKit })
 * </script>
 *
 * <button onclick={() => editor.commands.toggleBold()}
 *         aria-pressed={$state.isActive('bold')}>Bold</button>
 * <div use:action></div>
 * ```
 *
 * The editor is created immediately rather than on mount, so commands, content
 * and `getJSON()` all work before anything is on screen — which is what a
 * server render and a test both need.
 */
export function matra<const T extends readonly AnyDef[]>(
  options: EditorOptions<T>,
): MatraAction<T> {
  const editor = createEditor(options)

  const action = (node: HTMLElement): EditorAction => {
    // A component rendered twice, or an action re-run by a hot reload, must not
    // attach a second view to one element.
    if (!editor.unsafe.view) editor.mount(node)
    return {
      destroy() {
        editor.destroy()
      },
    }
  }

  return { action, editor, state: editorState(editor) }
}

/**
 * A store that changes whenever the editor does.
 *
 * The value is the editor itself, not a copy: a toolbar wants to ask
 * `isActive` and `getText` at render time, and cloning a document to answer
 * that would be the expensive way to do nothing.
 */
export function editorState<T extends readonly AnyDef[]>(
  editor: Editor<T>,
): Readable<Editor<T>> {
  return readable(editor, (set) => {
    const republish = () => set(editor)
    const offChange = editor.on('change', republish)
    const offSelection = editor.on('selectionChange', republish)
    return () => {
      offChange()
      offSelection()
    }
  })
}
