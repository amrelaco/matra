import type { AnyDef, Editor } from 'matra'
import { useEffect, useRef } from 'react'

export interface EditorContentProps<T extends readonly AnyDef[] = readonly AnyDef[]>
  extends React.HTMLAttributes<HTMLDivElement> {
  editor: Editor<T>
}

/**
 * The element the editor mounts into.
 *
 * The mount is guarded on `unsafe.view` so StrictMode's double-invoke in
 * development cannot leave two views attached to one element.
 */
export function EditorContent<T extends readonly AnyDef[]>({
  editor,
  ...rest
}: EditorContentProps<T>) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element || editor.unsafe.view) return
    editor.mount(element)
  }, [editor])

  return <div ref={ref} {...rest} />
}
