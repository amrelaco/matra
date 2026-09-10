import type { Command, NodeDef } from '../types'

export interface AudioAttrs {
  src: string
  title?: string | null
  /** Show the browser's own transport. Off means the host draws its own. */
  controls?: boolean
}

/**
 * A sound file in the document.
 *
 * A block rather than an inline node: an audio player is a paragraph-sized
 * thing with its own controls, and putting one mid-sentence produces a line box
 * the height of a transport bar. Tiptap's is a block for the same reason.
 *
 * The source is checked the way an image's is · a document is data, and data
 * that arrives from somewhere else must not be able to name a `javascript:`
 * URL and have the page honour it.
 */

/** Reject anything that is not a source a browser will fetch safely. */
export function isSafeAudioSrc(src: unknown): src is string {
  if (typeof src !== 'string' || !src.length) return false
  // Scheme-relative: inherits the page's protocol and leaves the site.
  if (src.startsWith('//')) return false
  if (src.startsWith('/') || src.startsWith('./')) return true
  if (src.startsWith('data:audio/')) return true
  try {
    const { protocol } = new URL(src)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const audio = {
  kind: 'node',
  name: 'audio' as const,
  group: 'block',
  atom: true,
  draggable: true,
  attrs: {
    src: { required: true },
    title: { default: null },
    controls: { default: true },
  },
  parseDOM: [
    {
      tag: 'audio[src]',
      getAttrs: (dom) => {
        const el = dom as Element
        const src = el.getAttribute('src')
        if (!isSafeAudioSrc(src)) return false
        return {
          src,
          title: el.getAttribute('title'),
          controls: el.hasAttribute('controls'),
        }
      },
    },
  ],
  toDOM: (node) => {
    const attrs = node.attrs ?? {}
    return [
      'audio',
      {
        src: attrs.src,
        title: attrs.title ?? null,
        // `controls` is boolean in HTML: present or absent, never "false".
        controls: attrs.controls === false ? null : true,
        preload: 'metadata',
      },
    ]
  },
  commands: {
    insertAudio: (ctx, attrs) =>
      isSafeAudioSrc(attrs.src) ? ctx.insert({ type: 'audio', attrs: { ...attrs } }) : false,
  },
} satisfies NodeDef<{ insertAudio: Command<[AudioAttrs]> }>
