import type { Node } from '../engine/model'
import { engine } from '../internal'
import type { Command, DecorationSpec, ExtensionDef, Pos, Range } from '../types'
import { type BlockCache, positionalText, scanBlocks, textblocksIn } from './block-scan'

export interface SearchOptions {
  /** Extension name, and the key `editor.extensionState` reads. */
  name?: string
  /** Class on every match. */
  matchClass?: string
  /** Class on the current match, in addition to `matchClass`. */
  currentClass?: string
}

export interface SearchQuery {
  query: string
  caseSensitive?: boolean
  /** Treat the query as a regular expression rather than literal text. */
  regex?: boolean
  wholeWord?: boolean
}

export interface SearchState extends Required<SearchQuery> {
  /** Every match, in document order. */
  matches: Range[]
  /** Index into `matches` of the current one, or -1. */
  current: number
}

const SET = 'search:set'
const MOVE = 'search:move'

/** A match inside one block, relative to the block's start. */
interface LocalMatch {
  from: number
  to: number
}

const EMPTY: SearchState = {
  query: '',
  caseSensitive: false,
  regex: false,
  wholeWord: false,
  matches: [],
  current: -1,
}

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Compile a query, or null when it cannot match anything. */
function compile(state: SearchQuery): RegExp | null {
  if (!state.query) return null
  let source = state.regex ? state.query : escapeRegex(state.query)
  if (state.wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  try {
    return new RegExp(source, `gu${state.caseSensitive ? '' : 'i'}`)
  } catch {
    return null
  }
}

/** Matches inside one top-level block. A match never crosses a textblock. */
function matchesIn(block: Node, pattern: RegExp): LocalMatch[] {
  const out: LocalMatch[] = []
  textblocksIn(block, (textblock, offset) => {
    const text = positionalText(textblock)
    pattern.lastIndex = 0
    let hit: RegExpExecArray | null = pattern.exec(text)
    while (hit) {
      if (hit[0].length === 0) {
        // A pattern that matches nothing would match it forever.
        pattern.lastIndex++
      } else {
        out.push({ from: offset + hit.index, to: offset + hit.index + hit[0].length })
      }
      hit = pattern.exec(text)
    }
  })
  return out
}

/**
 * Find and replace.
 *
 * Every match is a decoration, so nothing about searching touches the
 * document, and replacing all of them is one transaction and one undo step.
 *
 * Matches are recomputed per block and cached on the block node: typing in
 * one paragraph rescans that paragraph and reads every other paragraph's
 * matches back, so a search left open while writing costs the paragraph
 * being written, not the document.
 *
 * ```ts
 * editor.commands.setSearch({ query: 'colour', caseSensitive: false })
 * editor.commands.nextMatch()
 * editor.commands.replaceMatch('color')
 * editor.commands.replaceAllMatches('color')
 * editor.commands.clearSearch()
 * ```
 */
export function search(options: SearchOptions = {}): ExtensionDef<
  {
    setSearch: Command<[query: SearchQuery | string]>
    clearSearch: Command
    nextMatch: Command
    previousMatch: Command
    replaceMatch: Command<[replacement: string]>
    replaceAllMatches: Command<[replacement: string]>
  },
  SearchState
> {
  const name = options.name ?? 'search'
  const matchClass = options.matchClass ?? 'matra-search-match'
  const currentClass = options.currentClass ?? 'matra-search-current'

  let cache: BlockCache<LocalMatch[]> = new WeakMap()
  let pattern: RegExp | null = null
  let compiledFor: string | null = null

  const sameQuery = (a: SearchQuery, b: SearchQuery) =>
    a.query === b.query &&
    Boolean(a.caseSensitive) === Boolean(b.caseSensitive) &&
    Boolean(a.regex) === Boolean(b.regex) &&
    Boolean(a.wholeWord) === Boolean(b.wholeWord)

  const patternFor = (state: SearchQuery): RegExp | null => {
    const key = JSON.stringify([state.query, state.caseSensitive, state.regex, state.wholeWord])
    if (key !== compiledFor) {
      compiledFor = key
      pattern = compile(state)
      cache = new WeakMap()
    }
    return pattern
  }

  const collect = (doc: Node, state: SearchQuery): Range[] => {
    const regex = patternFor(state)
    if (!regex) return []
    const out: Range[] = []
    scanBlocks(
      doc,
      cache,
      (block) => matchesIn(block, regex),
      (local, _block, pos) => {
        for (const match of local) {
          out.push({ from: (pos + match.from) as Pos, to: (pos + match.to) as Pos })
        }
      },
    )
    return out
  }

  /** The index of the first match at or after a position. */
  const indexAt = (matches: Range[], pos: number): number => {
    let low = 0
    let high = matches.length - 1
    let found = -1
    while (low <= high) {
      const mid = (low + high) >>> 1
      if ((matches[mid] as Range).from >= pos) {
        found = mid
        high = mid - 1
      } else low = mid + 1
    }
    return found
  }

  const stateOf = (ctx: Parameters<Command>[0]) =>
    (engine(ctx).pluginState(name) as SearchState | undefined) ?? EMPTY

  const move = (ctx: Parameters<Command>[0], delta: 1 | -1): boolean => {
    const state = stateOf(ctx)
    if (!state.matches.length) return false
    const count = state.matches.length
    // From the caret when nothing is current yet, so "next" finds the match
    // after where the reader is rather than the first one in the document.
    let index = state.current
    if (index === -1) {
      const at = indexAt(state.matches, ctx.selection.from)
      index =
        delta === 1 ? (at === -1 ? 0 : at) : at === -1 ? count - 1 : (at - 1 + count) % count
    } else {
      index = (index + delta + count) % count
    }
    const match = state.matches[index] as Range
    ctx.select(match)
    engine(ctx).tr.setMeta(MOVE, index)
    return true
  }

  return {
    kind: 'extension',
    name,

    state: {
      init: () => EMPTY,
      apply(ctx, previous) {
        const { tr } = engine(ctx)
        const set = tr.getMeta(SET) as SearchQuery | null | undefined
        const moved = tr.getMeta(MOVE) as number | undefined

        let next = previous
        if (set === null) return EMPTY
        if (set !== undefined) {
          next = {
            query: set.query,
            caseSensitive: Boolean(set.caseSensitive),
            regex: Boolean(set.regex),
            wholeWord: Boolean(set.wholeWord),
            matches: previous.matches,
            current: previous.current,
          }
        }
        if (!next.query) return next === previous ? previous : EMPTY

        const queryChanged = next !== previous && !sameQuery(next, previous)
        if (queryChanged || tr.docChanged || next.matches === EMPTY.matches) {
          // Where the current match will be, so it stays current across an
          // edit somewhere else in the document.
          const anchor =
            previous.current >= 0 && previous.matches[previous.current]
              ? tr.mapping.map((previous.matches[previous.current] as Range).from)
              : null
          const matches = collect(tr.doc, next)
          let current = -1
          if (moved !== undefined) current = moved
          else if (anchor !== null && !queryChanged) {
            const at = indexAt(matches, anchor)
            current = at !== -1 && (matches[at] as Range).from === anchor ? at : -1
            // The current match was edited away: the next one takes its place.
            if (current === -1 && at !== -1 && previous.matches.length !== matches.length) {
              current = at
            }
          }
          if (current >= matches.length) current = matches.length ? matches.length - 1 : -1
          next = { ...next, matches, current }
        } else if (moved !== undefined) {
          next = { ...next, current: moved }
        }
        return next
      },
    },

    decorations(ctx) {
      const state = engine(ctx).pluginState(name) as SearchState | undefined
      if (!state?.matches.length) return []
      const out: DecorationSpec[] = []
      for (let i = 0; i < state.matches.length; i++) {
        const match = state.matches[i] as Range
        out.push({
          type: 'inline',
          from: match.from,
          to: match.to,
          attrs: { class: i === state.current ? `${matchClass} ${currentClass}` : matchClass },
        })
      }
      return out
    },

    commands: {
      setSearch: (ctx, query) => {
        const spec: SearchQuery = typeof query === 'string' ? { query } : query
        if (!spec || typeof spec.query !== 'string') return false
        engine(ctx).tr.setMeta(SET, spec.query ? spec : null)
        return true
      },

      clearSearch: (ctx) => {
        if (!stateOf(ctx).query) return false
        engine(ctx).tr.setMeta(SET, null)
        return true
      },

      nextMatch: (ctx) => move(ctx, 1),
      previousMatch: (ctx) => move(ctx, -1),

      /** Replace the current match — or, with none current, the first one. */
      replaceMatch: (ctx, replacement) => {
        if (typeof replacement !== 'string') return false
        const state = stateOf(ctx)
        if (!state.matches.length) return false
        const index = state.current === -1 ? 0 : state.current
        const match = state.matches[index] as Range
        if (!ctx.replace(match, replacement)) return false
        // The next match slides into this index once the document is
        // rescanned; asking for it by index keeps "replace, replace" moving.
        engine(ctx).tr.setMeta(MOVE, index)
        return true
      },

      /** Every match, last to first so earlier positions hold · one undo step. */
      replaceAllMatches: (ctx, replacement) => {
        if (typeof replacement !== 'string') return false
        const state = stateOf(ctx)
        if (!state.matches.length) return false
        for (let i = state.matches.length - 1; i >= 0; i--) {
          ctx.replace(state.matches[i] as Range, replacement)
        }
        ctx.isolateUndo()
        return true
      },
    },
  }
}

/** Enough styling to see the matches. */
export const searchCSS = `
.matra-search-match { background: rgba(255, 213, 0, 0.35); border-radius: 2px; }
.matra-search-current { background: rgba(255, 140, 0, 0.55); }
`
