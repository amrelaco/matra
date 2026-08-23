import type { Command, MarkDef } from '../types'

export interface LinkAttrs {
  href: string
  target?: string | null
  rel?: string | null
}

/** Anything that is not http(s), mailto or a same-page anchor is dropped. */
function isSafeHref(href: unknown): href is string {
  if (typeof href !== 'string' || !href.length) return false
  if (href.startsWith('#') || href.startsWith('/')) return true
  try {
    const { protocol } = new URL(href)
    return protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:'
  } catch {
    return false
  }
}

export const link: MarkDef<{
  setLink: Command<[LinkAttrs]>
  unsetLink: Command
}> = {
  kind: 'mark',
  name: 'link',
  inclusive: false,
  attrs: {
    href: { required: true },
    target: { default: '_blank' },
    rel: { default: 'noopener noreferrer' },
  },
  parseDOM: [
    {
      tag: 'a[href]',
      getAttrs: (dom) => {
        const href = (dom as Element).getAttribute('href')
        if (!isSafeHref(href)) return false
        return {
          href,
          target: (dom as Element).getAttribute('target'),
          rel: (dom as Element).getAttribute('rel'),
        }
      },
    },
  ],
  toDOM: (mark) => ['a', mark.attrs ?? {}, 0],
  commands: {
    setLink: (ctx, attrs) =>
      isSafeHref(attrs.href) ? ctx.addMark('link', { ...attrs }) : false,
    unsetLink: (ctx) => ctx.removeMark('link'),
  },
}
