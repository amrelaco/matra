import { engine } from '../internal'
import type { Command, NodeDef } from '../types'

export interface YoutubeAttrs {
  /** A video id, or any YouTube URL — watch, share, embed or short. */
  src: string
  width?: number
  height?: number
  /** Seconds in. */
  start?: number
}

const ID = /^[\w-]{11}$/

/** The eleven-character id, from whatever form of address was pasted. */
export function youtubeId(source: unknown): string | null {
  if (typeof source !== 'string') return null
  const text = source.trim()
  if (ID.test(text)) return text
  try {
    const url = new URL(text)
    const host = url.hostname.replace(/^www\.|^m\./, '')
    let id: string | null = null
    if (host === 'youtu.be') id = url.pathname.slice(1)
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id =
        url.searchParams.get('v') ??
        /^\/(?:embed|shorts|live|v)\/([\w-]{11})/.exec(url.pathname)?.[1] ??
        null
    }
    return id && ID.test(id) ? id : null
  } catch {
    return null
  }
}

const size = (value: unknown, fallback: number): number => {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= 4096 ? Math.round(n) : fallback
}

const seconds = (value: unknown): number => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

/**
 * A YouTube video, embedded.
 *
 * Only the id is stored. The frame's address is built from it here, on the
 * privacy-preserving domain, so a document can never carry a frame pointing
 * anywhere else — an embed whose `src` is trusted from JSON is an `<iframe>`
 * to any page an attacker likes.
 */
export const youtube = {
  kind: 'node',
  name: 'youtube' as const,
  group: 'block',
  atom: true,
  draggable: true,
  attrs: {
    src: { required: true },
    width: { default: 640 },
    height: { default: 360 },
    start: { default: 0 },
  },
  parseDOM: [
    {
      tag: 'div[data-youtube-video]',
      getAttrs: (dom) => {
        const element = dom as Element
        const id = youtubeId(element.getAttribute('data-youtube-video'))
        if (!id) return false
        return {
          src: id,
          width: size(element.getAttribute('data-width'), 640),
          height: size(element.getAttribute('data-height'), 360),
          start: seconds(element.getAttribute('data-start')),
        }
      },
    },
    {
      tag: 'iframe[src]',
      getAttrs: (dom) => {
        const element = dom as Element
        const id = youtubeId(element.getAttribute('src'))
        if (!id) return false
        return {
          src: id,
          width: size(element.getAttribute('width'), 640),
          height: size(element.getAttribute('height'), 360),
          start: 0,
        }
      },
    },
  ],
  toDOM: (node) => {
    const id = youtubeId(node.attrs?.src) ?? ''
    const width = size(node.attrs?.width, 640)
    const height = size(node.attrs?.height, 360)
    const start = seconds(node.attrs?.start)
    const src = `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ''}`
    return [
      'div',
      {
        'data-youtube-video': id,
        'data-width': width,
        'data-height': height,
        'data-start': start,
        class: 'matra-youtube',
        contenteditable: 'false',
      },
      [
        'iframe',
        {
          src,
          width,
          height,
          frameborder: '0',
          allowfullscreen: 'true',
          allow:
            'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          referrerpolicy: 'strict-origin-when-cross-origin',
          title: 'YouTube video',
        },
      ],
    ]
  },
  commands: {
    insertYoutube: (ctx, attrs) => {
      const id = youtubeId(attrs?.src)
      if (!id) return false
      // A block, so it goes after the block the caret is in.
      const { tr } = engine(ctx)
      const $from = tr.selection.$from
      const at = $from.depth > 0 ? $from.after($from.depth) : tr.selection.from
      return ctx.insert(
        {
          type: 'youtube',
          attrs: {
            src: id,
            width: size(attrs.width, 640),
            height: size(attrs.height, 360),
            start: seconds(attrs.start),
          },
        },
        at as never,
      )
    },
  },
} satisfies NodeDef<{ insertYoutube: Command<[attrs: YoutubeAttrs]> }>

export const youtubeCSS = `
.matra-youtube { position: relative; max-width: 100%; margin: 1em 0; }
.matra-youtube iframe { max-width: 100%; border-radius: 8px; display: block; }
`
