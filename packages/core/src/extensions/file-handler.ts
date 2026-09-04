import type { Editor, ExtensionDef, Pos, PosMarker } from '../types'

export interface FileEvent {
  editor: Editor
  files: File[]
  /** Where a drop landed. Null for a paste, or a drop outside the text. */
  pos: Pos | null
  /**
   * `pos`, kept correct while an upload is in flight.
   *
   * By the time the server answers, the user has typed. Insert at
   * `marker.map(pos)` and the image lands where it was dropped, not where
   * that number now points.
   */
  marker: PosMarker
}

export interface FileHandlerOptions {
  /** MIME types or prefixes to take: `['image/']`. Left off, every file. */
  accept?: readonly string[]
  onDrop?: (event: FileEvent) => void
  onPaste?: (event: FileEvent) => void
}

/**
 * Files dropped on or pasted into the editor.
 *
 * The editor cannot know where a file should go — an upload endpoint, a data
 * URL, a placeholder while the request runs — so it hands the files over with
 * a position that survives the wait. A screenshot pasted from the clipboard
 * arrives here as a file, the same as one dragged from the desktop.
 *
 * ```ts
 * fileHandler({
 *   accept: ['image/'],
 *   async onDrop({ editor, files, pos, marker }) {
 *     for (const file of files) {
 *       const src = await upload(file)
 *       editor.commands.insert({ type: 'image', attrs: { src } }, pos && marker.map(pos))
 *     }
 *   },
 * })
 * ```
 */
export function fileHandler(options: FileHandlerOptions): ExtensionDef {
  let editor: Editor | null = null
  const accepted = (file: File) =>
    !options.accept || options.accept.some((type) => file.type.startsWith(type))

  return {
    kind: 'extension',
    name: 'fileHandler',
    onCreate: (owner) => {
      editor = owner
    },
    onDestroy: () => {
      editor = null
    },
    handlePaste: (ctx, data) => {
      if (!options.onPaste || !editor) return false
      const files = data.files.filter(accepted)
      if (!files.length) return false
      options.onPaste({ editor, files, pos: null, marker: ctx.mark() })
      return true
    },
    handleDrop: (ctx, data) => {
      if (!options.onDrop || !editor) return false
      const files = data.files.filter(accepted)
      if (!files.length) return false
      options.onDrop({ editor, files, pos: data.pos, marker: ctx.mark() })
      return true
    },
  }
}
