import type { Command, NodeDef } from '../types'

export interface ImageAttrs {
  src: string
  alt?: string | null
  title?: string | null
}

/** Reject anything that is not an image URL a browser will fetch safely. */
function isSafeSrc(src: unknown): src is string {
  if (typeof src !== 'string' || !src.length) return false
  if (src.startsWith('//')) return false
  if (src.startsWith('/') || src.startsWith('./')) return true
  if (src.startsWith('data:image/')) return true
  try {
    const { protocol } = new URL(src)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

export const image = {
  kind: 'node',
  name: 'image' as const,
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  attrs: {
    src: { required: true },
    alt: { default: null },
    title: { default: null },
  },
  parseDOM: [
    {
      tag: 'img[src]',
      getAttrs: (dom) => {
        const src = (dom as Element).getAttribute('src')
        if (!isSafeSrc(src)) return false
        return {
          src,
          alt: (dom as Element).getAttribute('alt'),
          title: (dom as Element).getAttribute('title'),
        }
      },
    },
  ],
  toDOM: (node) => ['img', node.attrs ?? {}],
  commands: {
    insertImage: (ctx, attrs) =>
      isSafeSrc(attrs.src) ? ctx.insert({ type: 'image', attrs: { ...attrs } }) : false,
  },
} satisfies NodeDef<{ insertImage: Command<[ImageAttrs]> }>
