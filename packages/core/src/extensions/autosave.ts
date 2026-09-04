import { REPLACE_ALL, engine } from '../internal'
import type { Command, DocNode, Editor, ExtensionDef } from '../types'

export interface AutosaveOptions {
  /**
   * Persist the document. A returned promise is waited for; whatever it
   * rejects with, or the function throws, is reported and never thrown on.
   */
  save: (doc: DocNode, editor: Editor) => void | Promise<void>
  /** How long typing has to pause before a save. Default 1000ms. */
  delay?: number
  /**
   * Content to load when the editor mounts — what the last save left behind.
   * Loading it is not an edit: the document is not dirty afterwards.
   */
  restore?: () => DocNode | string | null | undefined
  /** Told about every save that failed. */
  onError?: (error: unknown) => void
  /** Save at once when the page is hidden or unloaded. Default true. */
  flushOnHide?: boolean
}

export interface AutosaveState {
  /** Changed since the last successful save. */
  dirty: boolean
  /** A save is running. */
  saving: boolean
  /** When the last save succeeded, as `Date.now()`, or null before any has. */
  savedAt: number | null
  /** What the last save failed with, until one succeeds. */
  error: unknown | null
}

const REQUEST = 'autosave:request'
const DONE = 'autosave:done'

interface Done {
  ok: boolean
  error: unknown
}

const INITIAL: AutosaveState = { dirty: false, saving: false, savedAt: null, error: null }

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof (value as { then?: unknown } | null)?.then === 'function'

/**
 * Save the document once typing pauses.
 *
 * Every change marks the document dirty and starts the clock; the save runs
 * `delay` after the last one, so a sentence costs one save rather than one
 * per letter. `save()` saves now. When the page is hidden or unloaded a dirty
 * document is saved before it goes, since a pause that never comes is the
 * usual way an autosave loses the last paragraph.
 *
 * The state is reduced from transactions like any other: a change marks it
 * dirty, and the save reports back through `markSaved`, which is a command
 * so that the report is a transaction too. A save that fails leaves the
 * document dirty with `error` set and is not retried on its own — the next
 * change, or `save()`, tries again — because retrying a server that is down
 * every second is how a server that is down stays down.
 *
 * A save runs outside any command, after the transaction that asked for it
 * has landed, because `save` is application code and may do anything at all.
 * `editor.can.save()` asks without saving. One `autosave()` per editor: it
 * holds the editor it was mounted in.
 *
 * ```ts
 * autosave({
 *   delay: 800,
 *   save: (doc) => localStorage.setItem('draft', JSON.stringify(doc)),
 *   restore: () => JSON.parse(localStorage.getItem('draft') ?? 'null'),
 * })
 * ```
 */
export function autosave(options: AutosaveOptions): ExtensionDef<
  {
    save: Command
    markSaved: Command<[ok: boolean, error?: unknown]>
  },
  AutosaveState
> {
  const name = 'autosave'
  const given = Number(options.delay)
  const delay = Number.isFinite(given) && given >= 0 ? given : 1000

  let editor: Editor | null = null
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null
  /** A `save()` command has landed and its save is waiting for the next tick. */
  let queued = false
  let inFlight = false
  /** The document the running save was given, to tell an edit made during it. */
  let snapshot: unknown = null
  const cleanups: Array<() => void> = []

  const stateOf = (owner: Editor): AutosaveState =>
    owner.extensionState<AutosaveState>(name) ?? INITIAL

  const commandsOf = (owner: Editor) =>
    owner.commands as unknown as {
      save(): boolean
      markSaved(ok: boolean, error?: unknown): boolean
    }

  const clearTimer = () => {
    if (timer === null) return
    globalThis.clearTimeout(timer)
    timer = null
  }

  const schedule = (owner: Editor) => {
    clearTimer()
    timer = globalThis.setTimeout(() => {
      timer = null
      flush(owner)
    }, delay)
  }

  const settle = (owner: Editor, ok: boolean, error: unknown) => {
    inFlight = false
    commandsOf(owner).markSaved(ok, error)
    if (!ok) options.onError?.(error)
    // Typed into while the save ran: what was saved is already behind.
    if (ok && editor === owner && stateOf(owner).dirty) schedule(owner)
  }

  /** Save, now, from outside any command. */
  const run = (owner: Editor) => {
    queued = false
    if (inFlight || editor !== owner) return
    clearTimer()
    const doc = owner.getJSON()
    snapshot = (owner.unsafe.state as { doc: unknown }).doc
    inFlight = true
    let result: unknown
    try {
      result = options.save(doc, owner)
    } catch (error) {
      settle(owner, false, error)
      return
    }
    if (isThenable(result)) {
      result.then(
        () => settle(owner, true, null),
        (error: unknown) => settle(owner, false, error),
      )
    } else {
      settle(owner, true, null)
    }
  }

  /** Save now: the state hears first, through the command, then the save runs. */
  const flush = (owner: Editor) => {
    // A save is running; its report reschedules if the document moved on.
    if (inFlight) return
    commandsOf(owner).save()
    run(owner)
  }

  return {
    kind: 'extension',
    name,

    state: {
      init: () => INITIAL,
      apply: (ctx, previous) => {
        const { tr } = engine(ctx)
        let next = previous
        if (tr.docChanged) {
          // A document loaded whole is the saved one, or a different one;
          // either way nothing of the user's is in it yet.
          const dirty = tr.getMeta(REPLACE_ALL) !== true
          if (next.dirty !== dirty) next = { ...next, dirty }
        }
        if (tr.getMeta(REQUEST) === true && !next.saving) next = { ...next, saving: true }
        const done = tr.getMeta(DONE) as Done | undefined
        if (done) {
          next = done.ok
            ? { dirty: tr.doc !== snapshot, saving: false, savedAt: Date.now(), error: null }
            : { ...next, saving: false, error: done.error }
        }
        return next
      },
    },

    commands: {
      save: (ctx) => {
        if (!editor) return false
        const { tr, dry } = engine(ctx)
        tr.setMeta(REQUEST, true)
        if (dry || queued) return true
        queued = true
        const owner = editor
        // After this transaction has landed, and outside the command that
        // asked: `save` is application code and may edit the document itself.
        Promise.resolve().then(() => {
          if (queued) run(owner)
        })
        return true
      },

      markSaved: (ctx, ok, error) => {
        if (typeof ok !== 'boolean') return false
        const failure: Done = {
          ok,
          error: ok ? null : (error ?? new Error('Matra: the save failed')),
        }
        engine(ctx).tr.setMeta(DONE, failure)
        return true
      },
    },

    onCreate(owner) {
      editor = owner
      if (options.restore) {
        const content = options.restore()
        if (content) owner.setContent(content)
      }

      cleanups.push(
        owner.on('change', () => {
          if (stateOf(owner).dirty) schedule(owner)
          else clearTimer()
        }),
      )

      if (options.flushOnHide !== false && typeof window !== 'undefined') {
        const onHide = () => {
          if (stateOf(owner).dirty) flush(owner)
        }
        const onVisibility = () => {
          if (window.document.visibilityState === 'hidden') onHide()
        }
        window.addEventListener('pagehide', onHide)
        window.document.addEventListener('visibilitychange', onVisibility)
        cleanups.push(() => window.removeEventListener('pagehide', onHide))
        cleanups.push(() =>
          window.document.removeEventListener('visibilitychange', onVisibility),
        )
      }
    },

    onDestroy(owner) {
      for (const off of cleanups) off()
      cleanups.length = 0
      // Whatever was waiting for the pause goes now: nobody will be here when it ends.
      if (stateOf(owner).dirty) flush(owner)
      clearTimer()
      queued = false
      if (editor === owner) editor = null
    },
  }
}
