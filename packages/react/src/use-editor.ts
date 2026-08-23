import { createEditor } from '@matrajs/core'
import type { AnyDef, Editor, EditorOptions } from '@matrajs/core'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * Create an editor that lives for the lifetime of the component.
 *
 * The editor is created lazily on first render and destroyed on unmount.
 * Options are read once — changing them later will not recreate the editor,
 * because tearing down a live document on a prop change loses the user's work.
 * Use the returned editor's commands to change things instead.
 */
export function useEditor<const T extends readonly AnyDef[]>(
  options: EditorOptions<T>,
): Editor<T> {
  const ref = useRef<Editor<T> | null>(null)
  if (ref.current === null) ref.current = createEditor(options)
  const editor = ref.current

  useEffect(() => {
    return () => {
      editor.destroy()
      ref.current = null
    }
  }, [editor])

  return editor
}

/**
 * Re-render when the editor changes.
 *
 * Toolbars need this: without it, `editor.commands` mutate the document but
 * React never hears about it, so active states go stale.
 */
export function useEditorState<T extends readonly AnyDef[], S>(
  editor: Editor<T>,
  select: (editor: Editor<T>) => S,
): S {
  const subscribe = useRef((onChange: () => void) => {
    const offChange = editor.on('change', onChange)
    const offSelection = editor.on('selectionChange', onChange)
    return () => {
      offChange()
      offSelection()
    }
  }).current

  return useSyncExternalStore(
    subscribe,
    () => select(editor),
    () => select(editor),
  )
}

/** True while the editor has DOM focus. */
export function useEditorFocus<T extends readonly AnyDef[]>(editor: Editor<T>): boolean {
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    const onFocus = editor.on('focus', () => setFocused(true))
    const onBlur = editor.on('blur', () => setFocused(false))
    return () => {
      onFocus()
      onBlur()
    }
  }, [editor])
  return focused
}
