import { createEditor } from '@matrajs/core'
import type { AnyDef, Editor, EditorOptions } from '@matrajs/core'
import {
  type Ref,
  getCurrentInstance,
  markRaw,
  onBeforeUnmount,
  onScopeDispose,
  readonly,
  ref,
} from 'vue'

/**
 * Create an editor that lives as long as the component using it.
 *
 * The editor is deliberately **not** reactive: it is a mutable object with its
 * own change events, and wrapping it in a proxy would make Vue trace every
 * document node on every keystroke. `markRaw` keeps it out of the reactivity
 * graph; use `useEditorState` to read from it reactively.
 */
export function useEditor<const T extends readonly AnyDef[]>(
  options: EditorOptions<T>,
): Editor<T> {
  const editor = markRaw(createEditor(options))

  const dispose = () => editor.destroy()
  // Works inside a component or a bare effect scope.
  if (getCurrentInstance()) onBeforeUnmount(dispose)
  else onScopeDispose(dispose)

  return editor
}

/**
 * A reactive view of the editor.
 *
 * Toolbars need this: commands mutate the document, but Vue has no way to know
 * unless something subscribes. The selector re-runs on every change and
 * selection move.
 */
export function useEditorState<T extends readonly AnyDef[], S>(
  editor: Editor<T>,
  select: (editor: Editor<T>) => S,
): Readonly<Ref<S>> {
  const value = ref(select(editor)) as Ref<S>

  const update = () => {
    value.value = select(editor)
  }
  const offChange = editor.on('change', update)
  const offSelection = editor.on('selectionChange', update)

  const dispose = () => {
    offChange()
    offSelection()
  }
  if (getCurrentInstance()) onBeforeUnmount(dispose)
  else onScopeDispose(dispose)

  return readonly(value) as Readonly<Ref<S>>
}

/** True while the editor has DOM focus. */
export function useEditorFocus<T extends readonly AnyDef[]>(
  editor: Editor<T>,
): Readonly<Ref<boolean>> {
  const focused = ref(false)
  const offFocus = editor.on('focus', () => {
    focused.value = true
  })
  const offBlur = editor.on('blur', () => {
    focused.value = false
  })

  const dispose = () => {
    offFocus()
    offBlur()
  }
  if (getCurrentInstance()) onBeforeUnmount(dispose)
  else onScopeDispose(dispose)

  return readonly(focused)
}
