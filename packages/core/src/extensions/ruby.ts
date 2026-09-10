import type { Command, NodeDef } from '../types'

/**
 * Furigana · a reading printed above its base text.
 *
 * `<ruby>漢字<rt>かんじ</rt></ruby>`. Japanese needs it wherever a reader may not
 * know a kanji, and Chinese typesetting uses the same element for pinyin, so
 * this is not a niche of a niche · it is how CJK text is annotated at all.
 *
 * The base is content, so it stays real editable text with marks and
 * spellcheck intact and a caret can sit inside it. The reading is an attribute:
 * one short string that is never formatted, and modelling it as a second child
 * would let a caret wander into the annotation and a paste drop a paragraph in
 * it.
 *
 * That split only works because a parse rule can say where the content is.
 * `<ruby>` holds the base *and* the `rt`, so without `contentElement` the
 * reading is parsed as part of the word it annotates and 漢字 comes back as
 * 漢字かんじ. This shipped for an afternoon as an atom with the base as an
 * attribute, which round-tripped correctly and could not be edited.
 */
export const ruby = {
  kind: 'node',
  name: 'ruby' as const,
  group: 'inline',
  inline: true,
  content: 'text*',
  attrs: {
    reading: { default: '' },
  },
  parseDOM: [
    {
      tag: 'ruby',
      getAttrs: (dom) => ({
        reading: (dom as Element).querySelector('rt')?.textContent ?? '',
      }),
      // A clone, because removing the annotation from the live element would
      // edit the page being parsed · `rp` goes too, since its brackets are a
      // fallback for browsers without ruby support and not part of the word.
      contentElement: (dom: Element) => {
        const clone = dom.cloneNode(true) as Element
        for (const part of Array.from(clone.querySelectorAll('rt, rp'))) part.remove()
        return clone
      },
    },
  ],
  toDOM: (node) => {
    const reading = String(node.attrs?.reading ?? '')
    return reading ? ['ruby', 0, ['rp', '('], ['rt', reading], ['rp', ')']] : ['ruby', 0]
  },
  commands: {
    /** Annotate the selection. An empty reading leaves the text unwrapped. */
    setRuby: (ctx, reading) => (reading ? ctx.wrapIn('ruby', { reading }) : false),
    unsetRuby: (ctx) => ctx.lift(),
  },
} satisfies NodeDef<{ setRuby: Command<[reading: string]>; unsetRuby: Command }>
