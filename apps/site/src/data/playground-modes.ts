/**
 * Four interfaces over one editor.
 *
 * Matra draws nothing, which is easy to say and hard to believe until the same
 * document is sitting under a Notion-shaped interface, a Google-Docs-shaped one
 * and no interface at all — with the extension array underneath barely moving.
 * That is what a mode is: chrome, measure and typography. It never changes the
 * document, and it only ever *adds* extensions, so switching modes cannot take
 * away something you ticked.
 */
export interface Mode {
  id: string
  name: string
  /** One line, shown under the switch. */
  blurb: string
  /** Ticked on arrival, because the skin is a lie without them. */
  needs: string[]
  chrome: {
    /** The bar above the document. `glyphs` is icons, `ribbon` is words. */
    bar: 'glyphs' | 'ribbon' | 'none'
    /** The menu that follows a selection. */
    bubble: boolean
    /** The handle and the plus in the left margin. */
    handles: boolean
    /** The margin: comments, outline, counts, search. */
    rail: boolean
    /** A page with edges and a shadow, on a desk. */
    page: boolean
  }
}

export const MODES: Mode[] = [
  {
    id: 'paper',
    name: 'Matra',
    blurb: 'This site’s own interface · a workbench, ruled like paper.',
    needs: [
      'bold',
      'italic',
      'link',
      'heading',
      'bulletList',
      'listItem',
      'placeholder',
      'history',
    ],
    chrome: { bar: 'glyphs', bubble: true, handles: false, rail: true, page: false },
  },
  {
    id: 'notion',
    name: 'Notion',
    blurb: 'No toolbar at all · a slash menu, a drag handle and a bubble over the selection.',
    needs: [
      'suggestion',
      'dragHandle',
      'heading',
      'bulletList',
      'orderedList',
      'listItem',
      'taskList',
      'taskItem',
      'blockquote',
      'codeBlock',
      'callout',
      'bold',
      'italic',
      'code',
      'strike',
      'link',
      'placeholder',
      'trailingNode',
      'history',
    ],
    chrome: { bar: 'none', bubble: true, handles: true, rail: false, page: false },
  },
  {
    id: 'docs',
    name: 'Docs',
    blurb: 'A ribbon in words, a page on a desk, and comment threads in the margin.',
    needs: [
      'comment',
      'heading',
      'bold',
      'italic',
      'underline',
      'strike',
      'link',
      'textAlign',
      'lineHeight',
      'bulletList',
      'orderedList',
      'listItem',
      'image',
      'table',
      'tableRow',
      'tableCell',
      'tableHeader',
      'characterCount',
      'history',
      'pageBreak',
    ],
    chrome: { bar: 'ribbon', bubble: true, handles: false, rail: true, page: true },
  },
  {
    id: 'bare',
    name: 'Headless',
    blurb: 'No chrome whatsoever. The same editor, with nothing drawn around it.',
    needs: [],
    chrome: { bar: 'none', bubble: false, handles: false, rail: false, page: false },
  },
]

export const DEFAULT_MODE = 'paper'

export const modeById = (id: string): Mode =>
  MODES.find((mode) => mode.id === id) ?? (MODES[0] as Mode)
