import type {
  AnyDef,
  Command,
  Ctx,
  DecorationSpec,
  DocNode,
  Editor,
  ExtensionDef,
} from '@matrajs/core'
import { type DocDiff, blockStarts, diffDocs, sizeOf } from './diff'

/** One saved state of the document. */
export interface Version {
  readonly id: number
  readonly label: string
  /** Epoch milliseconds, from the clock the caller supplied. */
  readonly at: number
  readonly doc: DocNode
  /** Characters in the document when it was taken. */
  readonly size: number
}

export interface VersionsState {
  versions: Version[]
  /** The version currently being compared against, if any. */
  previewing: number | null
  /** The diff from that version to the document as it is now. */
  diff: DocDiff | null
}

/**
 * Where the list lives between visits.
 *
 * Without one, a version history is undo with labels: the snapshots are in
 * memory and the tab closing takes them. `load` is read once when the editor is
 * created and `save` is called whenever the list changes — a `localStorage`
 * pair, a `fetch` to your own endpoint, whatever you already have. Nothing here
 * knows or cares which.
 */
export interface VersionStore {
  /** The versions this document had last time. Sync, so the first render has them. */
  load(): Version[] | null
  /** Called whenever the list changes. Debouncing it is yours to decide. */
  save(versions: Version[]): void
}

/** A store backed by the browser, for the case that needs no server. */
export function localVersionStore(key: string): VersionStore {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as Version[]) : null
      } catch {
        // Corrupt, quota-blocked or a private window. A history that cannot be
        // read is not worth taking the editor down for.
        return null
      }
    },
    save(versions) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(versions))
      } catch {}
    },
  }
}

export interface VersionsOptions {
  /**
   * Where "now" comes from.
   *
   * Injected rather than reached for, because a test that has to sleep to make
   * two versions differ is a test that fails on a slow machine.
   */
  now?: () => number
  /**
   * Take a snapshot when the document has been still for this long.
   *
   * Null turns it off and leaves snapshots to `snapshotVersion`. A version per
   * keystroke is not history, it is a keylogger with a nicer name.
   */
  idleMs?: number | null
  /** How many to keep. The oldest go first; the first one taken never does. */
  keep?: number
  /** Called whenever the list or the preview changes. */
  onChange?: (state: VersionsState) => void
  /** Where the list lives between visits. Without one it lives until reload. */
  store?: VersionStore
}

const SET = 'versions:set'

export const versionClasses = {
  added: 'matra-version-added',
  changed: 'matra-version-changed',
  removed: 'matra-version-removed',
} as const

/** The engine surface this package uses. Unstable, and excluded from semver. */
interface VersionsEngine {
  tr: {
    getMeta(key: string): unknown
    setMeta(key: string, value: unknown): unknown
  }
  pluginState(key: string): unknown
}

const ENGINE = Symbol.for('matra.engine')

function engineOf(ctx: Ctx): VersionsEngine {
  const access = (ctx as unknown as Record<symbol, VersionsEngine>)[ENGINE]
  if (!access) throw new Error('Matra: versions ctx was created outside the engine')
  return access
}

interface SetMeta {
  add?: Version
  forget?: number
  previewing?: number | null
}

/**
 * Version history: snapshots, a real diff between them, and restore.
 *
 * The interesting part is not keeping copies of a document — anybody can push
 * `getJSON()` onto an array. It is answering "what changed" in the shape a
 * person reads it: this paragraph is new, that one was rewritten, this sentence
 * went. `diff.ts` does that by pairing blocks on their content first, so a
 * paragraph that moved is the same paragraph rather than a deletion and an
 * insertion at two unrelated places.
 *
 * Restoring is one transaction, so it is one press of undo, and the document as
 * it was before the restore is snapshotted on the way past. A history feature
 * you cannot get back out of is a way to lose an afternoon.
 */
export function versions(options: VersionsOptions = {}): ExtensionDef<
  {
    snapshotVersion: Command<[label?: string]>
    restoreVersion: Command<[id: number]>
    previewVersion: Command<[id: number | null]>
    forgetVersion: Command<[id: number]>
  },
  VersionsState
> {
  const now = options.now ?? (() => Date.now())
  const keep = Math.max(2, options.keep ?? 50)
  const idleMs = options.idleMs === undefined ? 30_000 : options.idleMs

  let nextId = 1
  let editorRef: Editor | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const take = (doc: DocNode, label: string): Version => ({
    id: nextId++,
    label,
    at: now(),
    doc,
    size: sizeOf(doc),
  })

  /** Trim to `keep`, but never drop the first version taken. */
  const trim = (list: Version[]): Version[] => {
    if (list.length <= keep) return list
    const first = list[0] as Version
    return [first, ...list.slice(list.length - (keep - 1))]
  }

  const stateOf = (ctx: Ctx): VersionsState | undefined =>
    engineOf(ctx).pluginState('versions') as VersionsState | undefined

  const snapshotVersion: Command<[string?]> = (ctx, label) => {
    const state = stateOf(ctx)
    const latest = state?.versions[state.versions.length - 1]
    // Nothing has moved since the last one. A list of identical versions is a
    // list nobody will scroll.
    if (latest && same(latest.doc, ctx.doc)) return false
    engineOf(ctx).tr.setMeta(SET, { add: take(ctx.doc, label ?? 'Snapshot') } satisfies SetMeta)
    return true
  }

  const restoreVersion: Command<[number]> = (ctx, id) => {
    const state = stateOf(ctx)
    const version = state?.versions.find((entry) => entry.id === id)
    if (!version) return false
    if (same(version.doc, ctx.doc)) return false

    const body = (version.doc.content ?? []) as DocNode[]
    if (body.length === 0) return false

    // Keep where the document was before restoring, or the only way back is
    // undo — and undo is not where anybody thinks to look for their work.
    const backup = take(ctx.doc, 'Before restore')
    const end = (sizeOf(ctx.doc) - 2) as never
    if (!ctx.replace({ from: 0 as never, to: end }, body)) return false
    // Its own undo step, whatever was typed a second ago. Undo grouping is a
    // kindness to typing and a hazard to anything deliberate.
    ctx.isolateUndo()

    engineOf(ctx).tr.setMeta(SET, { add: backup, previewing: null } satisfies SetMeta)
    return true
  }

  const previewVersion: Command<[number | null]> = (ctx, id) => {
    if (id !== null && !stateOf(ctx)?.versions.some((entry) => entry.id === id)) return false
    engineOf(ctx).tr.setMeta(SET, { previewing: id } satisfies SetMeta)
    return true
  }

  const forgetVersion: Command<[number]> = (ctx, id) => {
    if (!stateOf(ctx)?.versions.some((entry) => entry.id === id)) return false
    engineOf(ctx).tr.setMeta(SET, { forget: id } satisfies SetMeta)
    return true
  }

  return {
    kind: 'extension',
    name: 'versions',

    state: {
      // The first version exists from the moment the editor does, mounted or
      // not. Taking it from a lifecycle hook meant a headless editor — a test,
      // a server render, an import job — had no "before" to compare against.
      init: (ctx) => {
        // What the store remembers comes first, and the ids continue from it
        // rather than starting at one and colliding with what was loaded.
        const loaded = readStore(options.store)
        if (loaded) {
          nextId = Math.max(...loaded.map((entry) => entry.id)) + 1
          return { versions: loaded, previewing: null, diff: null }
        }
        return { versions: [take(ctx.doc, 'Opened')], previewing: null, diff: null }
      },
      apply: (ctx, previous) => {
        const change = engineOf(ctx).tr.getMeta(SET) as SetMeta | undefined
        let versions = previous.versions
        let previewing = previous.previewing

        if (change) {
          if (change.add) versions = trim([...versions, change.add])
          if (change.forget !== undefined) {
            versions = versions.filter((entry) => entry.id !== change.forget)
            if (previewing === change.forget) previewing = null
          }
          if (change.previewing !== undefined) previewing = change.previewing
        }

        const against = versions.find((entry) => entry.id === previewing)
        // Recomputed while previewing, because the point of a preview is to
        // watch the diff shrink as you accept what it is telling you.
        const diff = against ? diffDocs(against.doc, ctx.doc) : null

        const next: VersionsState = { versions, previewing, diff }
        // A store that cannot write — a full quota, a private window, a fetch
        // that rejects — must not take the transaction with it. Losing the
        // history is bad; losing the sentence somebody was typing is worse.
        if (versions !== previous.versions && options.store) {
          try {
            options.store.save(versions)
          } catch (error) {
            console.error('Matra: the version store refused to save', error)
          }
        }
        if (versions !== previous.versions || previewing !== previous.previewing || diff) {
          options.onChange?.(next)
        }
        return next
      },
    },

    /**
     * Draw the preview over the document as it is now.
     *
     * Only blocks that are still here can be decorated; a block deleted since
     * the snapshot is not in the document to draw on. Those stay in
     * `diff.blocks` for the application to list beside the editor, which is a
     * decision about layout and belongs there rather than here.
     */
    decorations(ctx: Ctx): DecorationSpec[] {
      const diff = stateOf(ctx)?.diff
      if (!diff || diff.same) return []

      const starts = blockStarts(ctx.doc)
      const body = (ctx.doc.content ?? []) as DocNode[]
      const out: DecorationSpec[] = []

      for (const block of diff.blocks) {
        if (block.kind !== 'added' && block.kind !== 'changed') continue
        const start = starts[block.after]
        const node = body[block.after]
        if (start === undefined || node === undefined) continue
        out.push({
          type: 'node',
          from: start as never,
          to: (start + sizeOf(node)) as never,
          attrs: { class: versionClasses[block.kind] },
        })
      }
      return out
    },

    commands: { snapshotVersion, restoreVersion, previewVersion, forgetVersion },

    onCreate(editor) {
      editorRef = editor
    },

    onChange() {
      if (idleMs === null) return
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        idleTimer = null
        if (editorRef) snapshot(editorRef, 'Autosave')
      }, idleMs)
    },

    onDestroy() {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = null
      editorRef = null
    },
  }
}

/** What the store remembers, or nothing if it cannot say. */
function readStore(store: VersionStore | undefined): Version[] | null {
  if (!store) return null
  try {
    const loaded = store.load()
    return Array.isArray(loaded) && loaded.length > 0 ? loaded : null
  } catch (error) {
    console.error('Matra: the version store refused to load', error)
    return null
  }
}

/** Two documents that read the same. */
const same = (a: DocNode, b: DocNode) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Call our own command on an editor we were only handed as `Editor`.
 *
 * The lifecycle hooks receive the bare interface, which carries the core
 * commands and knows nothing about ours — so the cast lives here, once, rather
 * than at the call site.
 */
function snapshot(editor: Editor, label: string): void {
  const commands = editor.commands as unknown as {
    snapshotVersion?: (label?: string) => boolean
  }
  commands.snapshotVersion?.(label)
}

/** Everything a caller has saved, newest last. */
export function versionList(editor: Editor<readonly AnyDef[]>): Version[] {
  return editor.extensionState<VersionsState>('versions')?.versions ?? []
}

/** The stylesheet the preview decorations expect, for pasting into an app. */
export const versionDiffCSS = `
.${versionClasses.added} { background: rgba(63, 155, 90, 0.14); }
.${versionClasses.changed} { background: rgba(200, 150, 40, 0.16); }
.${versionClasses.removed} { text-decoration: line-through; opacity: 0.55; }
`
