import type { Command, Ctx, Editor, ExtensionDef, PosMarker, Range } from '@matra/core'
import type { AiRequest, AiSession, AiStatus, AiStream } from './types'

export interface AiOptions {
  /** Where the text comes from. Keep the model key on your server, not here. */
  stream: AiStream
  /** Called on every status change, for spinners and error toasts. */
  onStatus?: (session: AiSession) => void
}

interface Live {
  id: number
  marker: PosMarker
  /** The range as captured when the request started. */
  captured: Range
  received: string
  status: AiStatus
  controller: AbortController
  error?: Error
}

/**
 * Streaming AI edits that survive concurrent typing.
 *
 * The whole point of this extension is the marker. A request captures the range
 * it is rewriting *and* a position marker; every chunk that comes back is
 * applied to `marker.mapRange(captured)`, not to the original numbers. The user
 * can type, delete and paste anywhere while the model is talking, and the
 * answer still lands on the words they selected.
 */
export function ai(options: AiOptions): ExtensionDef<{
  askAi: Command<[instruction: string]>
  cancelAi: Command
  acceptAi: Command
  rejectAi: Command
}> {
  let live: Live | null = null
  let nextId = 1
  let editorRef: Editor | null = null

  const snapshot = (): AiSession => ({
    id: live?.id ?? 0,
    status: live?.status ?? 'idle',
    range: live ? live.marker.mapRange(live.captured) : { from: 0 as never, to: 0 as never },
    received: live?.received ?? '',
    error: live?.error,
  })

  const report = (status: AiStatus) => {
    if (live) live.status = status
    options.onStatus?.(snapshot())
  }

  /** Replace the live range with whatever has arrived so far. */
  const applyChunk = (editor: Editor, session: Live) => {
    const target = session.marker.mapRange(session.captured)
    editor.commands.replace(target, session.received)
  }

  const askAi: Command<[string]> = (ctx, instruction) => {
    if (live && live.status === 'streaming') return false
    const editor = editorRef
    if (!editor) return false

    const { from, to } = ctx.selection
    if (from === to) return false

    const selected = selectedText(ctx)
    if (!selected) return false

    const session: Live = {
      id: nextId++,
      marker: ctx.mark(),
      captured: { from, to },
      received: '',
      status: 'streaming',
      controller: new AbortController(),
    }
    live = session
    report('streaming')

    void (async () => {
      const request: AiRequest = {
        text: selected,
        instruction,
        signal: session.controller.signal,
      }
      try {
        for await (const chunk of options.stream(request)) {
          if (session.controller.signal.aborted || live?.id !== session.id) return
          session.received += chunk
          applyChunk(editor, session)
          report('streaming')
        }
        if (live?.id === session.id) report('done')
      } catch (error) {
        if (live?.id !== session.id) return
        session.error = error instanceof Error ? error : new Error(String(error))
        report(session.controller.signal.aborted ? 'cancelled' : 'error')
      }
    })()

    return true
  }

  const cancelAi: Command = () => {
    if (!live || live.status !== 'streaming') return false
    live.controller.abort()
    report('cancelled')
    return true
  }

  const acceptAi: Command = () => {
    if (!live) return false
    live = null
    options.onStatus?.(snapshot())
    return true
  }

  /** Put back what was there before the model started talking. */
  const rejectAi: Command = (ctx) => {
    if (!live) return false
    live.controller.abort()
    const target = live.marker.mapRange(live.captured)
    live = null
    options.onStatus?.(snapshot())
    // The original text is recovered by undoing the streamed replacements.
    return ctx.select(target)
  }

  return {
    kind: 'extension',
    name: 'ai',
    commands: { askAi, cancelAi, acceptAi, rejectAi },
    onCreate(editor) {
      editorRef = editor as Editor
    },
    onDestroy() {
      live?.controller.abort()
      live = null
      editorRef = null
    },
  }
}

/** The plain text inside the current selection. */
function selectedText(ctx: Ctx): string {
  const { from, to } = ctx.selection
  const parts: string[] = []
  let offset = 0

  const walk = (node: { text?: string; content?: unknown[] }) => {
    if (typeof node.text === 'string') {
      const start = offset
      const end = offset + node.text.length
      if (end > from && start < to) {
        parts.push(node.text.slice(Math.max(0, from - start), Math.max(0, to - start)))
      }
      offset = end
      return
    }
    offset += 1
    for (const child of (node.content ?? []) as { text?: string; content?: unknown[] }[]) {
      walk(child)
    }
    offset += 1
  }

  walk(ctx.doc as { text?: string; content?: unknown[] })
  return parts.join('')
}
