import { engine } from '../internal'
import type { Command, NodeDef, Pos } from '../types'

/**
 * Furigana · a reading printed above its base text.
 *
 * `<ruby>漢字<rt>かんじ</rt></ruby>`. Japanese needs it wherever a reader may not
 * know a kanji, and Chinese typesetting uses the same element for pinyin, so
 * this is not a niche of a niche · it is how CJK text is annotated at all.
 *
 * The base is content rather than an attribute, so `getText`, search and a word
 * count all see 漢字 as the text it is. It is not editable in place, and that is
 * an engine limit rather than a choice: a selection snaps to the nearest
 * textblock, an inline node is not one, so no caret can be put inside a ruby.
 * `setRuby` and `unsetRuby` replace the node instead, which is what a furigana
 * control does anyway.
 *
 * The reading is an attribute: one short string that is never formatted, and
 * modelling it as a second child would let a paste drop a paragraph into an
 * annotation.
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
    /**
     * Annotate the selected text.
     *
     * `wrapIn` is the wrong tool and was the first attempt: it wraps a block
     * range in a block node, and this is an inline node holding inline text, so
     * the command returned false for every selection. The selected text is read
     * and put back inside a ruby instead.
     */
    setRuby: (ctx, reading) => {
      if (!reading) return false
      const { tr } = engine(ctx)
      const { from, to } = tr.selection
      if (from === to) return false
      const text = tr.doc.textBetween(from, to)
      if (!text) return false
      return ctx.replace(
        { from: from as Pos, to: to as Pos },
        { type: 'ruby', attrs: { reading }, content: [{ type: 'text', text }] },
      )
    },
    /**
     * Put the base text back on its own, dropping the annotation.
     *
     * Found by scanning rather than by walking up from the caret. The obvious
     * implementation asks which ancestors the caret is inside, and there are
     * none to find: no caret can be inside a ruby, so that version returned
     * false at every position in the document.
     */
    unsetRuby: (ctx) => {
      const { tr } = engine(ctx)
      const { from, to } = tr.selection
      let found: { from: number; to: number; text: string } | null = null
      // One position either side, so a caret resting against a ruby counts as
      // being at it · that is where the caret lands after `setRuby`.
      tr.doc.nodesBetween(Math.max(0, from - 1), to + 1, (node, pos) => {
        if (found || node.type.name !== 'ruby') return undefined
        found = {
          from: pos,
          to: pos + node.nodeSize,
          text: node.textBetween(0, node.content.size),
        }
        return false
      })
      if (!found) return false
      const hit = found as { from: number; to: number; text: string }
      return ctx.replace({ from: hit.from as Pos, to: hit.to as Pos }, hit.text)
    },
  },
} satisfies NodeDef<{ setRuby: Command<[reading: string]>; unsetRuby: Command }>
