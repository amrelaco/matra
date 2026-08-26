import { type AnyDef, type Editor, type EditorOptions, createEditor } from '@matrajs/core'
import { type Accessor, createSignal, onCleanup } from 'solid-js'

/**
 * Solid bindings.
 *
 * Solid's reactivity is not a render loop, so there is no `useSyncExternalStore`
 * shape to reach for: a signal that bumps on every change is enough, and
 * everything reading it re-runs and nothing else does.
 */

export interface MatraEditor<T extends readonly AnyDef[]> {
  /** The editor. It exists before anything is on screen. */
  editor: Editor<T>
  /** `ref={mount}` on the element the editor should live in. */
  mount: (element: HTMLElement) => void
  /**
   * Read this inside JSX to re-run when the editor changes.
   *
   * It returns the editor itself rather than a copy, because a toolbar asks
   * `isActive` at render time and cloning a document to answer that would be
   * the expensive way to do nothing.
   */
  state: Accessor<Editor<T>>
}

/**
 * Create an editor bound to this component's lifetime.
 *
 * ```tsx
 * const { editor, mount, state } = createMatra({ extensions: starterKit })
 *
 * return (
 *   <>
 *     <button onClick={() => editor.commands.toggleBold()}
 *             aria-pressed={state().isActive('bold')}>Bold</button>
 *     <div ref={mount} />
 *   </>
 * )
 * ```
 */
export function createMatra<const T extends readonly AnyDef[]>(
  options: EditorOptions<T>,
): MatraEditor<T> {
  const editor = createEditor(options)

  // A counter rather than the editor itself: the editor is one object that
  // never changes identity, so a signal holding it would never notify.
  const [version, bump] = createSignal(0)
  const republish = () => bump((count) => count + 1)

  const offChange = editor.on('change', republish)
  const offSelection = editor.on('selectionChange', republish)

  onCleanup(() => {
    offChange()
    offSelection()
    editor.destroy()
  })

  const mount = (element: HTMLElement) => {
    // Guarded, because a ref can run twice under a hot reload and two views on
    // one element is two carets fighting over it.
    if (!editor.unsafe.view) editor.mount(element)
  }

  const state: Accessor<Editor<T>> = () => {
    version()
    return editor
  }

  return { editor, mount, state }
}
