import type { Node } from '../engine/model'
import type { EditorState } from '../engine/state'
import { engine } from '../internal'
import type { DecorationSpec, ExtensionDef, Pos } from '../types'
import { positionalText, textblocksIn } from './block-scan'

export interface SelectionHighlightOptions {
  /** The shortest selection that is looked for elsewhere. Default 2. */
  minLength?: number
  /** Match case. Default false. */
  caseSensitive?: boolean
  /** Whole words only, so a selected `cat` leaves `cats` alone. Default false. */
  wholeWord?: boolean
  /** The most matches drawn, so a common word in a long document stays cheap. Default 500. */
  max?: number
}

/** A match inside one top-level block, relative to the block's start. */
interface LocalMatch {
  from: number
  to: number
}

/**
 * What a block was scanned for, and what was found.
 *
 * `scanBlocks` remembers one result per block and asks nothing else, which is
 * right for a search whose query sits in state and wrong here, where the
 * query is whatever is selected and changes with every drag. The query is
 * kept next to the result so a block is rescanned when either is new.
 */
interface Scan {
  key: string
  matches: LocalMatch[]
}

const CLASS = 'matra-selection-match'
const NONE: DecorationSpec[] = []

const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function compile(query: string, caseSensitive: boolean, wholeWord: boolean): RegExp {
  let source = escapeRegex(query)
  if (wholeWord) source = `(?<![\\p{L}\\p{N}_])(?:${source})(?![\\p{L}\\p{N}_])`
  return new RegExp(source, `gu${caseSensitive ? '' : 'i'}`)
}

/** Matches inside one top-level block. A match never crosses a textblock. */
function matchesIn(block: Node, pattern: RegExp): LocalMatch[] {
  const out: LocalMatch[] = []
  textblocksIn(block, (textblock, offset) => {
    const text = positionalText(textblock)
    pattern.lastIndex = 0
    let hit = pattern.exec(text)
    while (hit) {
      out.push({ from: offset + hit.index, to: offset + hit.index + hit[0].length })
      hit = pattern.exec(text)
    }
  })
  return out
}

/**
 * Every other occurrence of the selected word, highlighted.
 *
 * What a code editor does when a name is selected, and what makes "is this
 * used anywhere else" a glance rather than a search. Only a selection that
 * could be a word qualifies: inside one textblock, no whitespace, at least
 * `minLength` characters. The selected range itself is left alone, since the
 * browser is already drawing that one.
 *
 * Matches are found per top-level block and remembered on the block node
 * with the query they were found for. Moving the selection to another
 * occurrence of the same word rescans nothing; typing rescans the paragraph
 * being typed in; selecting a different word rescans each block as it is
 * reached. The result is memoised on the document and the selection, so a
 * transaction that changed neither hands the renderer the same array and it
 * draws nothing.
 *
 * ```ts
 * createEditor({ extensions: [...starterKit, selectionHighlight()] })
 * ```
 */
export function selectionHighlight(options: SelectionHighlightOptions = {}): ExtensionDef {
  const minLength = Math.max(1, options.minLength ?? 2)
  const caseSensitive = options.caseSensitive === true
  const wholeWord = options.wholeWord === true
  const max = Math.max(0, options.max ?? 500)

  const cache: WeakMap<Node, Scan> = new WeakMap()
  let pattern: RegExp | null = null
  let compiledFor = ''
  let last: { doc: Node; key: string; from: number; to: number; out: DecorationSpec[] } | null =
    null

  const patternFor = (query: string): RegExp => {
    if (!pattern || query !== compiledFor) {
      compiledFor = query
      pattern = compile(query, caseSensitive, wholeWord)
    }
    return pattern
  }

  /** The selected text, when it is the kind of thing worth looking for elsewhere. */
  const queryOf = (state: EditorState): string | null => {
    const { $from, $to, from, to } = state.selection
    if (to - from < minLength) return null
    if ($from.depth === 0 || $from.depth !== $to.depth || $from.start() !== $to.start()) {
      return null
    }
    const parent = $from.parent
    if (!parent.isTextblock) return null
    const text = parent.textBetween($from.parentOffset, $to.parentOffset)
    // Shorter than the range means an image or a mention sat inside it.
    if (text.length !== to - from || /\s/.test(text)) return null
    return text
  }

  return {
    kind: 'extension',
    name: 'selectionHighlight',

    decorations(ctx) {
      const { state } = engine(ctx)
      const query = queryOf(state)
      if (query === null) {
        last = null
        return NONE
      }
      // Two spellings of one word are one query when case does not count,
      // and the blocks scanned for the first need not be scanned for the second.
      const key = caseSensitive ? query : query.toLowerCase()
      const { doc } = state
      const { from, to } = state.selection
      if (
        last &&
        last.doc === doc &&
        last.key === key &&
        last.from === from &&
        last.to === to
      ) {
        return last.out
      }

      const regex = patternFor(key)
      const out: DecorationSpec[] = []
      const blocks = doc.content.content
      let offset = 0
      for (let i = 0; i < blocks.length && out.length < max; i++) {
        const block = blocks[i] as Node
        let scan = cache.get(block)
        if (!scan || scan.key !== key) {
          scan = { key, matches: matchesIn(block, regex) }
          cache.set(block, scan)
        }
        for (const match of scan.matches) {
          if (out.length >= max) break
          const start = offset + match.from
          const end = offset + match.to
          if (start === from && end === to) continue
          out.push({
            type: 'inline',
            from: start as Pos,
            to: end as Pos,
            attrs: { class: CLASS },
          })
        }
        offset += block.nodeSize
      }
      last = { doc, key, from, to, out: out.length ? out : NONE }
      return last.out
    },
  }
}

/** Enough styling to see the other occurrences. */
export const selectionHighlightCSS = `
.matra-selection-match { background: rgba(255, 213, 0, 0.3); border-radius: 2px; }
`
