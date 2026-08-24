import type { DocNode } from '../types'

export interface TocEntry {
  /** Heading level, 1–6. */
  level: number
  /** The heading's text, as it currently reads. */
  text: string
  /** Where the heading starts, so clicking an entry can scroll to it. */
  pos: number
  /** A slug, unique within this document — two "Setup" headings differ. */
  id: string
}

/**
 * The headings of a document, in order.
 *
 * Derived on demand rather than stored. A cached outline is a second copy of
 * the document that can disagree with it, and the disagreement always surfaces
 * as a table of contents pointing at a heading that has been renamed.
 *
 * Positions come out of the same walk, so an entry can scroll to its heading
 * without a second search.
 */
export function tableOfContents(doc: DocNode): TocEntry[] {
  const out: TocEntry[] = []
  const used = new Map<string, number>()

  const walk = (node: DocNode, pos: number): number => {
    if (node.type === 'heading') {
      const text = textOf(node)
      const base = slug(text)
      const seen = used.get(base) ?? 0
      used.set(base, seen + 1)
      out.push({
        level: Number(node.attrs?.level ?? 1),
        text,
        pos,
        id: seen === 0 ? base : `${base}-${seen}`,
      })
    }
    let inner = pos + 1
    for (const child of node.content ?? []) inner = walk(child, inner)
    return pos + sizeOf(node)
  }

  let at = 0
  for (const child of doc.content ?? []) at = walk(child, at)
  return out
}

function textOf(node: DocNode): string {
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map(textOf).join('')
}

function sizeOf(node: DocNode): number {
  if (typeof node.text === 'string') return node.text.length
  let inner = 0
  for (const child of node.content ?? []) inner += sizeOf(child)
  return inner + 2
}

/**
 * A URL-safe slug.
 *
 * Unicode letters are kept rather than stripped, so a Bangla or Japanese
 * heading gets a readable anchor instead of an empty one.
 */
function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .trim()
    // \p{M} matters: in Bangla and Devanagari the vowel signs are combining
    // marks, so stripping them turns নথি into নথ — a different word.
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
  return cleaned || 'section'
}
