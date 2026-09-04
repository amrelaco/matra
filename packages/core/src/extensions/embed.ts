import { NodeSelection } from '../engine/state'
import { engine } from '../internal'
import type { Command, NodeDef, Pos } from '../types'

export interface EmbedAttrs {
  /** Read out to assistive technology; the frame has no other name. */
  title?: string | null
  /** Width to height, as CSS `aspect-ratio` writes it. Default `16/9`. */
  aspect?: string
}

/**
 * Where a frame may point.
 *
 * A string is an exact hostname. A RegExp is tested against the whole URL. A
 * function decides for itself. Whichever form, the address must be `https:`.
 */
export type EmbedAllow = ReadonlyArray<RegExp | string> | ((src: string) => boolean)

export interface EmbedOptions {
  /** Left off, a short list of well-known players and tools applies. */
  allow?: EmbedAllow
}

/**
 * Hosts whose embed pages are meant to be framed. Google is on the list for
 * Maps alone: the rest of the site framed inside a document is a phishing
 * page waiting for its text.
 */
const DEFAULT_HOSTS: ReadonlySet<string> = new Set([
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'codepen.io',
  'www.figma.com',
  'www.loom.com',
  'open.spotify.com',
  'codesandbox.io',
  'stackblitz.com',
])

const ASPECT = /^\d{1,3}\/\d{1,3}$/
const DEFAULT_ASPECT = '16/9'
const ASPECT_IN_STYLE = /aspect-ratio:\s*(\d{1,3})\s*\/\s*(\d{1,3})/

const isAspect = (value: unknown): value is string =>
  typeof value === 'string' && ASPECT.test(value)

const defaultAllow = (url: URL): boolean =>
  url.hostname === 'www.google.com'
    ? url.pathname.startsWith('/maps')
    : DEFAULT_HOSTS.has(url.hostname)

/**
 * The gate, built once from the option.
 *
 * A RegExp with the `g` or `y` flag remembers where its last match ended and
 * answers the next question from there, so one is copied without those flags
 * rather than tested as handed over.
 */
function gate(allow: EmbedAllow | undefined): (src: unknown) => src is string {
  const entries =
    allow && typeof allow !== 'function'
      ? allow.map((entry) =>
          typeof entry === 'string'
            ? entry
            : new RegExp(entry.source, entry.flags.replace(/[gy]/g, '')),
        )
      : []
  return (src): src is string => {
    if (typeof src !== 'string' || !src) return false
    let url: URL
    try {
      url = new URL(src)
    } catch {
      return false
    }
    if (url.protocol !== 'https:') return false
    if (typeof allow === 'function') return allow(src) === true
    if (!allow) return defaultAllow(url)
    for (const entry of entries) {
      if (typeof entry === 'string' ? url.hostname === entry : entry.test(src)) return true
    }
    return false
  }
}

/**
 * Anything with an embed page, in a frame.
 *
 * The frame is the dangerous part of a document, so the allowlist is not
 * optional: a `src` is checked when a command sets it, when HTML is parsed,
 * and again when the node renders — because a document loaded from JSON
 * skipped the first two, and that is how every real application loads
 * documents. A frame that fails the check at render time is withheld and the
 * wrapper stays, so the document keeps its data and fetches nothing.
 *
 * Every frame is sandboxed. Scripts and same-origin are allowed because most
 * embed pages stop working without them; navigating the top page is not.
 */
export function embed(options: EmbedOptions = {}): NodeDef<{
  insertEmbed: Command<[src: string, attrs?: EmbedAttrs]>
  setEmbedAspect: Command<[aspect: string, at?: Pos]>
}> {
  const allowed = gate(options.allow)

  return {
    kind: 'node',
    name: 'embed',
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,
    attrs: {
      src: { required: true },
      title: { default: null },
      aspect: { default: DEFAULT_ASPECT },
    },
    parseDOM: [
      {
        tag: 'div[data-embed]',
        getAttrs: (dom) => {
          const element = dom as Element
          const src = element.getAttribute('data-embed')?.trim()
          if (!allowed(src)) return false
          const found = ASPECT_IN_STYLE.exec(element.getAttribute('style') ?? '')
          return {
            src,
            title: element.querySelector('iframe')?.getAttribute('title') ?? null,
            aspect: found ? `${found[1]}/${found[2]}` : DEFAULT_ASPECT,
          }
        },
      },
      {
        tag: 'iframe[src]',
        getAttrs: (dom) => {
          const element = dom as Element
          const src = element.getAttribute('src')?.trim()
          if (!allowed(src)) return false
          return { src, title: element.getAttribute('title'), aspect: DEFAULT_ASPECT }
        },
      },
    ],
    toDOM: (node) => {
      const src = String(node.attrs?.src ?? '')
      const aspect = isAspect(node.attrs?.aspect) ? node.attrs.aspect : DEFAULT_ASPECT
      const title = node.attrs?.title
      const wrapper = {
        class: 'matra-embed',
        'data-embed': src,
        style: `aspect-ratio: ${aspect}`,
        contenteditable: 'false',
      }
      if (!allowed(src)) return ['div', wrapper]
      return [
        'div',
        wrapper,
        [
          'iframe',
          {
            src,
            title: typeof title === 'string' && title ? title : null,
            loading: 'lazy',
            sandbox: 'allow-scripts allow-same-origin allow-popups allow-forms',
            referrerpolicy: 'strict-origin-when-cross-origin',
            allowfullscreen: '',
          },
        ],
      ]
    },
    commands: {
      insertEmbed: (ctx, src, attrs) => {
        const source = typeof src === 'string' ? src.trim() : ''
        if (!allowed(source)) return false
        const aspect = attrs?.aspect ?? DEFAULT_ASPECT
        if (!isAspect(aspect)) return false
        const title = attrs?.title ?? null
        if (title !== null && typeof title !== 'string') return false
        // A block, so it goes after the block the caret is in.
        const { tr } = engine(ctx)
        const $from = tr.selection.$from
        const at = $from.depth > 0 ? $from.after($from.depth) : tr.selection.from
        return ctx.insert(
          { type: 'embed', attrs: { src: source, title: title || null, aspect } },
          at as Pos,
        )
      },
      setEmbedAspect: (ctx, aspect, at) => {
        if (!isAspect(aspect)) return false
        if (at !== undefined) return ctx.setNodeAttrs('embed', { aspect }, at)
        // An atom is never an ancestor of the caret, so the selection has to
        // be the node itself — which is what clicking one gives.
        const selection = engine(ctx).tr.selection
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'embed') {
          return false
        }
        return ctx.setNodeAttrs('embed', { aspect }, selection.from as Pos)
      },
    },
  }
}

export const embedCSS = `
.matra-embed { position: relative; width: 100%; margin: 1em 0; }
.matra-embed iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
`
