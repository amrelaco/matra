import type { DocNode } from '@matrajs/core'

/**
 * What changed between two documents.
 *
 * Block-level first, then word-level inside the blocks that survived as a pair.
 * That is the shape a person reads a diff in: "this paragraph is new, that one
 * lost a sentence" — not "characters 4,182 through 4,205".
 */
export interface WordRun {
  kind: 'added' | 'removed' | 'same'
  text: string
}

export interface BlockChange {
  kind: 'added' | 'removed' | 'changed' | 'same'
  /** Index in the earlier document, or -1 when the block is new. */
  before: number
  /** Index in the later document, or -1 when the block is gone. */
  after: number
  /** The text as it reads now, or as it read before for a removed block. */
  text: string
  /** Word runs, only for a block that changed. */
  words?: WordRun[]
}

export interface DocDiff {
  blocks: BlockChange[]
  added: number
  removed: number
  changed: number
  /** True when nothing at all moved. */
  same: boolean
}

/** Blocks compared beyond this and the pairing is positional, not optimal. */
const MAX_DP = 400

/** The text of one node, the way a reader sees it. */
export function textOf(node: DocNode): string {
  if (typeof node.text === 'string') return node.text
  const children = node.content
  if (!Array.isArray(children)) return ''
  let out = ''
  for (const child of children) out += textOf(child as DocNode)
  return out
}

/**
 * Model size of a node, by the same arithmetic the engine uses.
 *
 * Text costs its characters, a leaf costs one, everything else costs its
 * children plus its two borders. This is arithmetic over JSON the caller
 * already has, so it lives here rather than reaching into the engine for it.
 */
export function sizeOf(node: DocNode, isLeaf?: (type: string) => boolean): number {
  if (typeof node.text === 'string') return node.text.length
  const children = node.content
  if (!Array.isArray(children) || children.length === 0) {
    return isLeaf?.(node.type) ? 1 : 2
  }
  let inner = 0
  for (const child of children) inner += sizeOf(child as DocNode, isLeaf)
  return inner + 2
}

/** Where each top-level block starts, in document positions. */
export function blockStarts(doc: DocNode, isLeaf?: (type: string) => boolean): number[] {
  const out: number[] = []
  let at = 0
  for (const block of (doc.content ?? []) as DocNode[]) {
    out.push(at)
    at += sizeOf(block, isLeaf)
  }
  return out
}

/** What makes two blocks "the same block" for the purpose of pairing them. */
const keyOf = (node: DocNode) => `${node.type} ${textOf(node)}`

/** Indices of a longest common subsequence, as pairs. */
function lcs<T>(a: readonly T[], b: readonly T[]): [number, number][] {
  const rows = a.length
  const columns = b.length
  const table: number[] = new Array((rows + 1) * (columns + 1)).fill(0)
  const at = (i: number, j: number) => i * (columns + 1) + j

  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) {
      table[at(i, j)] =
        a[i] === b[j]
          ? (table[at(i + 1, j + 1)] as number) + 1
          : Math.max(table[at(i + 1, j)] as number, table[at(i, j + 1)] as number)
    }
  }

  const out: [number, number][] = []
  let i = 0
  let j = 0
  while (i < rows && j < columns) {
    if (a[i] === b[j]) {
      out.push([i, j])
      i++
      j++
      continue
    }
    if ((table[at(i + 1, j)] as number) >= (table[at(i, j + 1)] as number)) i++
    else j++
  }
  return out
}

/**
 * Pair up two runs of keys: which entry in `before` is which in `after`.
 *
 * Guarded rather than clever. The common prefix and suffix are trimmed first,
 * which reduces almost every real edit to a handful of entries in the middle,
 * and the table is only built when what is left is small enough to be worth it.
 * A document whose thousand blocks were all shuffled falls back to pairing by
 * position — worse than optimal, still correct, and it does not lock the tab.
 */
function pair(before: readonly string[], after: readonly string[]): [number, number][] {
  const pairs: [number, number][] = []
  let head = 0
  while (head < before.length && head < after.length && before[head] === after[head]) {
    pairs.push([head, head])
    head++
  }

  let tail = 0
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++
  }

  const a = before.slice(head, before.length - tail)
  const b = after.slice(head, after.length - tail)

  if (a.length > 0 && b.length > 0) {
    if (a.length * b.length <= MAX_DP * MAX_DP) {
      for (const [i, j] of lcs(a, b)) pairs.push([head + i, head + j])
    } else {
      const shared = Math.min(a.length, b.length)
      for (let i = 0; i < shared; i++) {
        if (a[i] === b[i]) pairs.push([head + i, head + i])
      }
    }
  }

  for (let i = 0; i < tail; i++) {
    pairs.push([before.length - tail + i, after.length - tail + i])
  }
  return pairs
}

/** Split on whitespace but keep it, so rejoining the runs gives the text back. */
const words = (text: string): string[] => text.match(/\s+|\S+/g) ?? []

/** Word-level runs between two strings. */
export function diffWords(before: string, after: string): WordRun[] {
  const a = words(before)
  const b = words(after)
  const kept = pair(a, b)

  const out: WordRun[] = []
  const push = (kind: WordRun['kind'], text: string) => {
    if (!text) return
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }

  let i = 0
  let j = 0
  for (const [ai, bj] of kept) {
    while (i < ai) push('removed', a[i++] as string)
    while (j < bj) push('added', b[j++] as string)
    push('same', a[ai] as string)
    i = ai + 1
    j = bj + 1
  }
  while (i < a.length) push('removed', a[i++] as string)
  while (j < b.length) push('added', b[j++] as string)
  return out
}

/**
 * Compare two documents, block by block and then word by word.
 *
 * Blocks are paired on type and text, so a paragraph that moved is the same
 * paragraph rather than one deletion and one insertion. A removal followed by
 * an addition at the same point is read as one block rewritten, which is the
 * difference between a diff a person can follow and a wall of red and green.
 */
export function diffDocs(before: DocNode, after: DocNode): DocDiff {
  const a = (before.content ?? []) as DocNode[]
  const b = (after.content ?? []) as DocNode[]
  const kept = pair(a.map(keyOf), b.map(keyOf))

  const blocks: BlockChange[] = []
  let i = 0
  let j = 0

  const flush = (toI: number, toJ: number) => {
    while (i < toI && j < toJ) {
      const from = a[i] as DocNode
      const to = b[j] as DocNode
      const text = textOf(to)
      blocks.push({
        kind: 'changed',
        before: i,
        after: j,
        text,
        words: diffWords(textOf(from), text),
      })
      i++
      j++
    }
    while (i < toI) {
      blocks.push({ kind: 'removed', before: i, after: -1, text: textOf(a[i] as DocNode) })
      i++
    }
    while (j < toJ) {
      blocks.push({ kind: 'added', before: -1, after: j, text: textOf(b[j] as DocNode) })
      j++
    }
  }

  for (const [ai, bj] of kept) {
    flush(ai, bj)
    blocks.push({ kind: 'same', before: ai, after: bj, text: textOf(b[bj] as DocNode) })
    i = ai + 1
    j = bj + 1
  }
  flush(a.length, b.length)

  let added = 0
  let removed = 0
  let changed = 0
  for (const block of blocks) {
    if (block.kind === 'added') added++
    else if (block.kind === 'removed') removed++
    else if (block.kind === 'changed') changed++
  }

  return { blocks, added, removed, changed, same: added + removed + changed === 0 }
}
