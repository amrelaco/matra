import type { Command, NodeDef } from '../types'

export interface RubyAttrs {
  /** The text being annotated · the kanji. */
  base: string
  /** The reading printed above it · the furigana. */
  reading: string
}

/**
 * Furigana · a reading printed above its base text.
 *
 * `<ruby>漢字<rt>かんじ</rt></ruby>`. Japanese needs it wherever a reader may not
 * know a kanji, and Chinese typesetting uses the same element for pinyin, so
 * this is not a niche of a niche · it is how CJK text is annotated at all.
 *
 * An atom, with the base as an attribute rather than as content. The obvious
 * design is content plus an `rt` child, and it does not survive a paste: the
 * parser walks every child element, and with no way to tell it which subtree is
 * the content, the reading comes back inside the base as text — 漢字かんじ. The
 * fix in ProseMirror is `contentElement`, which this parser does not have. So
 * both halves are attributes, they round-trip exactly, and a caret can never
 * end up inside an annotation.
 *
 * The cost is that the base is not editable in place. `setRuby` replaces the
 * node, which is what a furigana control does anyway.
 */
export const ruby = {
  kind: 'node',
  name: 'ruby' as const,
  group: 'inline',
  inline: true,
  atom: true,
  attrs: {
    base: { required: true },
    reading: { default: '' },
  },
  parseDOM: [
    {
      tag: 'ruby',
      getAttrs: (dom) => {
        const el = dom as Element
        const reading = el.querySelector('rt')?.textContent ?? ''
        // The base is everything the annotation is not. Cloned first, because
        // removing the `rt` from the live document would edit the page.
        const clone = el.cloneNode(true) as Element
        for (const part of Array.from(clone.querySelectorAll('rt, rp'))) part.remove()
        const base = (clone.textContent ?? '').trim()
        return base ? { base, reading } : false
      },
    },
  ],
  toDOM: (node) => {
    const attrs = node.attrs ?? {}
    const base = String(attrs.base ?? '')
    const reading = String(attrs.reading ?? '')
    // `rp` gives a browser without ruby support brackets to fall back to, and
    // costs two elements nothing else reads.
    return reading ? ['ruby', base, ['rp', '('], ['rt', reading], ['rp', ')']] : ['ruby', base]
  },
  commands: {
    setRuby: (ctx, base, reading) =>
      base ? ctx.insert({ type: 'ruby', attrs: { base, reading } }) : false,
  },
} satisfies NodeDef<{ setRuby: Command<[base: string, reading: string]> }>
