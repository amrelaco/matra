/**
 * Content expressions — ours.
 *
 * A node's `content` is a small language: `paragraph block*`, `(text | image)+`,
 * `heading{1,3}`. This module parses it, compiles it to a deterministic
 * automaton, and answers the two questions the editor actually asks:
 *
 *   - may this node type go here?
 *   - what is the shortest run of nodes that would make this valid?
 *
 * The second question is what lets the editor repair a document instead of
 * refusing an edit.
 */

/** The minimum a node type must expose for matching. */
export interface MatchableType {
  readonly name: string
  readonly groups: readonly string[]
  /** True when the type can be created with no attributes supplied. */
  readonly fillable?: boolean
}

// --- tokenizer --------------------------------------------------------------

type Token =
  | { kind: 'name'; value: string }
  | { kind: '|' | '(' | ')' | '+' | '*' | '?' }
  | { kind: 'range'; min: number; max: number }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < source.length) {
    const char = source[i] as string
    if (/\s/.test(char)) {
      i++
      continue
    }
    if (
      char === '|' ||
      char === '(' ||
      char === ')' ||
      char === '+' ||
      char === '*' ||
      char === '?'
    ) {
      tokens.push({ kind: char })
      i++
      continue
    }
    if (char === '{') {
      const end = source.indexOf('}', i)
      if (end === -1) throw new Error(`Matra: unclosed "{" in content expression "${source}"`)
      const body = source.slice(i + 1, end)
      const [minText, maxText] = body.includes(',') ? body.split(',') : [body, body]
      const min = Number(minText)
      const max = maxText?.trim() === '' ? Number.POSITIVE_INFINITY : Number(maxText)
      if (!Number.isFinite(min) || Number.isNaN(max)) {
        throw new Error(`Matra: bad range "{${body}}" in content expression "${source}"`)
      }
      tokens.push({ kind: 'range', min, max })
      i = end + 1
      continue
    }
    const name = /^[\w-]+/.exec(source.slice(i))
    if (!name) throw new Error(`Matra: unexpected "${char}" in content expression "${source}"`)
    tokens.push({ kind: 'name', value: name[0] })
    i += name[0].length
  }
  return tokens
}

// --- expression tree --------------------------------------------------------

type Expr =
  | { type: 'name'; value: string }
  | { type: 'seq'; exprs: Expr[] }
  | { type: 'choice'; exprs: Expr[] }
  | { type: 'repeat'; expr: Expr; min: number; max: number }

function parse(source: string): Expr {
  const tokens = tokenize(source)
  let pos = 0

  const peek = () => tokens[pos]
  const eat = (kind: Token['kind']) => {
    const token = tokens[pos]
    if (token?.kind === kind) {
      pos++
      return token
    }
    return null
  }

  function parseAtom(): Expr {
    if (eat('(')) {
      const inner = parseChoice()
      if (!eat(')')) throw new Error(`Matra: missing ")" in content expression "${source}"`)
      return inner
    }
    const token = peek()
    if (token?.kind !== 'name') {
      throw new Error(`Matra: expected a node name in content expression "${source}"`)
    }
    pos++
    return { type: 'name', value: token.value }
  }

  function parsePostfix(): Expr {
    let expr = parseAtom()
    for (;;) {
      if (eat('+')) expr = { type: 'repeat', expr, min: 1, max: Number.POSITIVE_INFINITY }
      else if (eat('*')) expr = { type: 'repeat', expr, min: 0, max: Number.POSITIVE_INFINITY }
      else if (eat('?')) expr = { type: 'repeat', expr, min: 0, max: 1 }
      else {
        const token = peek()
        if (token?.kind === 'range') {
          pos++
          expr = { type: 'repeat', expr, min: token.min, max: token.max }
        } else break
      }
    }
    return expr
  }

  function parseSeq(): Expr {
    const exprs: Expr[] = [parsePostfix()]
    while (peek()?.kind === 'name' || peek()?.kind === '(') exprs.push(parsePostfix())
    return exprs.length === 1 ? (exprs[0] as Expr) : { type: 'seq', exprs }
  }

  function parseChoice(): Expr {
    const exprs: Expr[] = [parseSeq()]
    while (eat('|')) exprs.push(parseSeq())
    return exprs.length === 1 ? (exprs[0] as Expr) : { type: 'choice', exprs }
  }

  const expr = parseChoice()
  if (pos !== tokens.length) {
    throw new Error(`Matra: trailing input in content expression "${source}"`)
  }
  return expr
}

// --- NFA --------------------------------------------------------------------

interface Edge {
  /** Undefined means an epsilon edge. */
  types?: MatchableType[]
  to: number
}

/** Compile the tree to an NFA whose states are arrays of edges. */
function toNFA(expr: Expr, resolve: (name: string) => MatchableType[]): Edge[][] {
  const states: Edge[][] = [[]]
  const node = () => states.push([]) - 1
  const edge = (from: number, to: number, types?: MatchableType[]) => {
    states[from]?.push({ types, to })
  }

  function compile(expr: Expr, from: number): number {
    switch (expr.type) {
      case 'name': {
        const to = node()
        edge(from, to, resolve(expr.value))
        return to
      }
      case 'seq': {
        let cursor = from
        for (const child of expr.exprs) cursor = compile(child, cursor)
        return cursor
      }
      case 'choice': {
        const to = node()
        for (const child of expr.exprs) edge(compile(child, from), to)
        return to
      }
      case 'repeat': {
        if (expr.max === Number.POSITIVE_INFINITY) {
          const start = node()
          edge(from, start)
          const end = compile(expr.expr, start)
          edge(end, start)
          const out = node()
          edge(end, out)
          // `*` may match nothing at all.
          if (expr.min === 0) edge(from, out)
          return out
        }
        let cursor = from
        for (let i = 0; i < expr.max; i++) {
          const next = compile(expr.expr, cursor)
          // Anything past `min` is optional, so allow leaving early.
          if (i >= expr.min) edge(cursor, next)
          cursor = next
        }
        return cursor
      }
    }
  }

  const end = compile(expr, 0)
  states[end]?.push({ to: -1 })
  return states
}

/** Every state reachable from `state` without consuming a node. */
function closure(states: Edge[][], state: number, seen = new Set<number>()): Set<number> {
  if (seen.has(state)) return seen
  seen.add(state)
  for (const edge of states[state] ?? []) {
    if (!edge.types && edge.to !== -1) closure(states, edge.to, seen)
    else if (!edge.types && edge.to === -1) seen.add(-1)
  }
  return seen
}

// --- DFA --------------------------------------------------------------------

export class ContentMatch {
  /** True when a node may legally end here. */
  readonly validEnd: boolean
  private readonly next: Array<{ type: MatchableType; match: ContentMatch }> = []

  private constructor(validEnd: boolean) {
    this.validEnd = validEnd
  }

  static empty = new ContentMatch(true)

  /** Compile an expression against a type resolver. */
  static parse(source: string, resolve: (name: string) => MatchableType[]): ContentMatch {
    if (!source.trim()) return ContentMatch.empty
    const nfa = toNFA(parse(source), resolve)
    return buildDFA(nfa)
  }

  /** The match state after `type`, or null when `type` may not appear here. */
  matchType(type: MatchableType): ContentMatch | null {
    for (const entry of this.next) {
      if (entry.type.name === type.name) return entry.match
    }
    return null
  }

  /** Run a whole run of types through the automaton. */
  matchTypes(types: readonly MatchableType[]): ContentMatch | null {
    let match: ContentMatch | null = this
    for (const type of types) {
      match = match.matchType(type)
      if (!match) return null
    }
    return match
  }

  /** Every type that could legally come next. */
  get allowed(): MatchableType[] {
    return this.next.map((entry) => entry.type)
  }

  /**
   * The shortest run of nodes that would let this match end legally.
   *
   * Returns an empty array when the match is already valid, and null when no
   * run of fillable types can close it — which is how the editor decides
   * between repairing a document and rejecting an edit.
   */
  fillBefore(depth = 4): MatchableType[] | null {
    if (this.validEnd) return []
    const queue: Array<{ match: ContentMatch; path: MatchableType[] }> = [
      { match: this, path: [] },
    ]
    const seen = new Set<ContentMatch>([this])
    while (queue.length) {
      const current = queue.shift()
      if (!current) break
      if (current.path.length >= depth) continue
      for (const entry of current.match.next) {
        if (entry.type.fillable === false) continue
        const path = [...current.path, entry.type]
        if (entry.match.validEnd) return path
        if (seen.has(entry.match)) continue
        seen.add(entry.match)
        queue.push({ match: entry.match, path })
      }
    }
    return null
  }

  /** Internal: used while building the DFA. */
  static create(validEnd: boolean): ContentMatch {
    return new ContentMatch(validEnd)
  }

  addNext(type: MatchableType, match: ContentMatch): void {
    this.next.push({ type, match })
  }
}

function buildDFA(nfa: Edge[][]): ContentMatch {
  const cache = new Map<string, ContentMatch>()

  function stateFor(states: Set<number>): ContentMatch {
    const key = [...states].sort((a, b) => a - b).join(',')
    const cached = cache.get(key)
    if (cached) return cached

    const match = ContentMatch.create(states.has(-1))
    cache.set(key, match)

    // Group outgoing edges by node type, then recurse into the merged target.
    const byType = new Map<string, { type: MatchableType; targets: Set<number> }>()
    for (const state of states) {
      if (state === -1) continue
      for (const edge of nfa[state] ?? []) {
        if (!edge.types) continue
        for (const type of edge.types) {
          const entry = byType.get(type.name) ?? { type, targets: new Set<number>() }
          for (const reachable of closure(nfa, edge.to)) entry.targets.add(reachable)
          byType.set(type.name, entry)
        }
      }
    }
    for (const entry of byType.values()) {
      match.addNext(entry.type, stateFor(entry.targets))
    }
    return match
  }

  return stateFor(closure(nfa, 0))
}
