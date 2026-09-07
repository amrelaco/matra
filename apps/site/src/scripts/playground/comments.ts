/**
 * Comment threads in the margin, the way a document people share has them.
 *
 * The extension stores one thing on the document: a mark carrying a thread id.
 * Everything a reader recognises as "a comment" — who wrote it, when, the
 * replies, the resolve button, the card sitting beside the right paragraph —
 * is this file, and none of it is in the document. That separation is the
 * point of the extension, and it is invisible until you can see both halves at
 * once, which is what the playground is for.
 *
 * Anchors are read back out of the document on every change rather than
 * stored, so editing the paragraph around a comment moves its card with the
 * words. Delete the commented text and the thread goes with it.
 */
import { commentRanges } from './registry'

type AnyEditor = {
  commands: Record<string, ((...args: unknown[]) => boolean) | undefined>
  getJSON: () => unknown
  selection: { empty: boolean }
  getText: () => string
}

export interface Reply {
  author: string
  body: string
  at: number
}

export interface Thread {
  id: string
  /** The words it was left on, as they read when it was made. */
  quote: string
  author: string
  body: string
  replies: Reply[]
  at: number
}

/**
 * The threads, kept where the document is not.
 *
 * A module-level map, so it survives the editor being destroyed and rebuilt
 * every time a box is ticked — which is exactly what a host application's
 * store would do.
 */
const threads = new Map<string, Thread>([
  [
    'thread-welcome',
    {
      id: 'thread-welcome',
      quote: 'a real Matra document',
      author: 'Nahim',
      body: 'The mark holds a thread id and nothing else. This card, and where it sits, is the host application — try editing the sentence and watch it follow.',
      replies: [
        {
          author: 'You',
          body: 'So the comment bodies never travel with a copy-paste. Good.',
          at: 0,
        },
      ],
      at: 0,
    },
  ],
])

let seq = 0
let active: string | null = null
let draft: string | null = null
/**
 * The thread whose reply box is open.
 *
 * Replying used to be `window.prompt`, which is a modal the browser owns: it
 * blocks the page, it cannot be styled, and on a page that also has an editor
 * it steals the selection on the way in and does not give it back. A textarea
 * in the card is the same three lines of code and none of that.
 */
let replyingTo: string | null = null

const nextId = (): string => {
  seq += 1
  return `t${Date.now().toString(36)}-${seq}`
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** "just now", and then honest numbers. A comment with no time on it reads as fake. */
function ago(at: number): string {
  if (!at) return 'earlier'
  const seconds = Math.round((Date.now() - at) / 1000)
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  return `${Math.round(seconds / 3600)} h ago`
}

export interface CommentsHost {
  /** The lane beside the page. */
  margin: HTMLElement
  /** The element the editor is mounted on, for measuring anchors. */
  doc: HTMLElement
  /** Told when the count changes, so a tab can carry a number. */
  onCount?: (count: number) => void
}

let host: CommentsHost | null = null
let editor: AnyEditor | null = null

export function attachComments(next: AnyEditor | null, next_host: CommentsHost): void {
  editor = next
  host = next_host
  render()
}

/**
 * Start a thread on the selection.
 *
 * Refuses an empty selection rather than making a comment that points at a
 * caret — the extension refuses it too, but saying why is better than a button
 * that appears to do nothing.
 */
export function startThread(target: AnyEditor): string | null {
  if (target.selection.empty) return null
  const id = nextId()
  if (!target.commands.addComment?.(id)) return null
  threads.set(id, {
    id,
    quote: '',
    author: 'You',
    body: '',
    replies: [],
    at: Date.now(),
  })
  active = id
  draft = id
  render()
  window.requestAnimationFrame(() => {
    host?.margin.querySelector<HTMLTextAreaElement>('textarea')?.focus()
  })
  return id
}

/** Bring a thread's card forward, and put the selection on the words it is about. */
export function focusThread(id: string, select = true): void {
  active = id
  if (select && editor) {
    const range = ranges().find((entry) => entry.threadId === id)
    if (range) editor.commands.select?.({ from: range.from, to: range.to } as never)
  }
  render()
}

function ranges(): { threadId: string; from: number; to: number; text: string }[] {
  if (!editor) return []
  try {
    return commentRanges(editor.getJSON())
  } catch {
    // A schema without the comment mark cannot have comment ranges.
    return []
  }
}

function resolve(id: string): void {
  editor?.commands.removeComment?.(id)
  threads.delete(id)
  if (active === id) active = null
  if (draft === id) draft = null
  if (replyingTo === id) replyingTo = null
  render()
}

function card(thread: Thread, quote: string, top: number): HTMLElement {
  const box = el('article', 'pg-thread')
  box.dataset.thread = thread.id
  box.style.top = `${Math.round(top)}px`
  if (thread.id === active) box.classList.add('on')

  const head = el('header', 'pg-thread-head')
  head.append(el('span', 'pg-thread-who', thread.author))
  head.append(el('span', 'pg-thread-when mono', ago(thread.at)))
  box.append(head)

  if (quote) box.append(el('p', 'pg-thread-quote', quote))

  if (thread.id === draft) {
    const field = el('textarea', 'pg-thread-input')
    field.rows = 3
    field.placeholder = 'Comment on the selection…'
    field.value = thread.body
    field.addEventListener('input', () => {
      thread.body = field.value
    })
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        post(thread.id)
      }
      if (event.key === 'Escape') resolve(thread.id)
    })
    box.append(field)

    const row = el('div', 'pg-thread-actions')
    const send = el('button', 'btn small', 'Comment')
    send.type = 'button'
    send.addEventListener('mousedown', (event) => {
      event.preventDefault()
      post(thread.id)
    })
    const cancel = el('button', 'btn ghost small', 'Cancel')
    cancel.type = 'button'
    cancel.addEventListener('mousedown', (event) => {
      event.preventDefault()
      resolve(thread.id)
    })
    row.append(send, cancel)
    box.append(row)
    return box
  }

  box.append(el('p', 'pg-thread-body', thread.body))

  for (const reply of thread.replies) {
    const item = el('div', 'pg-thread-reply')
    const who = el('header', 'pg-thread-head')
    who.append(el('span', 'pg-thread-who', reply.author))
    who.append(el('span', 'pg-thread-when mono', ago(reply.at)))
    item.append(who, el('p', 'pg-thread-body', reply.body))
    box.append(item)
  }

  if (thread.id === replyingTo) {
    const field = el('textarea', 'pg-thread-input')
    field.rows = 2
    field.placeholder = 'Reply…'
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const body = field.value.trim()
        if (body) thread.replies.push({ author: 'You', body, at: Date.now() })
        replyingTo = null
        render()
      }
      if (event.key === 'Escape') {
        replyingTo = null
        render()
      }
    })
    box.append(field)
    window.requestAnimationFrame(() => field.focus())
  }

  const row = el('div', 'pg-thread-actions')
  const reply = el('button', 'btn ghost small', thread.id === replyingTo ? 'Post' : 'Reply')
  reply.type = 'button'
  reply.addEventListener('mousedown', (event) => {
    event.preventDefault()
    if (thread.id !== replyingTo) {
      replyingTo = thread.id
      render()
      return
    }
    const field = host?.margin.querySelector<HTMLTextAreaElement>(
      `[data-thread="${CSS.escape(thread.id)}"] textarea`,
    )
    const body = field?.value.trim()
    if (body) thread.replies.push({ author: 'You', body, at: Date.now() })
    replyingTo = null
    render()
  })
  const done = el('button', 'btn ghost small', 'Resolve')
  done.type = 'button'
  done.title = 'Removes the mark from the document · the words stay'
  done.addEventListener('mousedown', (event) => {
    event.preventDefault()
    resolve(thread.id)
  })
  row.append(reply, done)
  box.append(row)

  box.addEventListener('mousedown', () => focusThread(thread.id))
  return box
}

function post(id: string): void {
  const thread = threads.get(id)
  if (!thread) return
  // An empty comment is a cancelled one; the mark goes with it.
  if (!thread.body.trim()) {
    resolve(id)
    return
  }
  thread.at = Date.now()
  draft = null
  render()
  editor?.commands.focus?.()
}

/**
 * Draw the lane.
 *
 * Cards are placed against the top of the text they are about and then pushed
 * down past each other, which is the whole of the layout — two comments on
 * neighbouring lines would otherwise sit on top of one another.
 */
export function render(): void {
  if (!host) return
  const lane = host.margin
  lane.replaceChildren()

  const found = ranges()
  const live = new Map<string, { from: number; text: string }>()
  for (const range of found) {
    const seen = live.get(range.threadId)
    if (!seen) live.set(range.threadId, { from: range.from, text: range.text })
    else seen.text += range.text
  }

  const laneTop = lane.getBoundingClientRect().top
  const placed: { id: string; top: number; quote: string }[] = []

  for (const [id, entry] of live) {
    const thread = threads.get(id)
    if (!thread) continue
    const anchor = host.doc.querySelector<HTMLElement>(`[data-comment="${CSS.escape(id)}"]`)
    const top = anchor ? anchor.getBoundingClientRect().top - laneTop : entry.from
    placed.push({ id, top, quote: thread.quote || entry.text })
  }

  placed.sort((a, b) => a.top - b.top)

  let floor = 0
  for (const item of placed) {
    const thread = threads.get(item.id)
    if (!thread) continue
    const top = Math.max(item.top, floor)
    const node = card(thread, item.quote, top)
    lane.append(node)
    floor = top + node.offsetHeight + 10
  }

  host.onCount?.(placed.length)
}
