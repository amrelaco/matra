import type { ExtensionDef } from '../types'

export interface AutolinkOptions {
  /** Turn a pasted URL into a link, or link the selection to it. Default true. */
  onPaste?: boolean
  /** Turn a URL into a link once a space is typed after it. Default true. */
  onType?: boolean
}

const URL_LIKE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/i
const TRAILING = /[.,;:!?)\]}'"]+$/

/** A URL a browser would actually go to, with the `www.` form made whole. */
export function normalizeUrl(candidate: string): string | null {
  const trimmed = candidate.replace(TRAILING, '')
  if (!trimmed) return null
  const href = /^www\./i.test(trimmed) ? `https://${trimmed}` : trimmed
  try {
    const url = new URL(href)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // A host with no dot is not an address anybody meant to type.
    if (!url.hostname.includes('.')) return null
    return href
  } catch {
    return null
  }
}

/**
 * URLs become links as they are typed and as they are pasted.
 *
 * Typing: once a space follows something that looks like a URL, the URL gets
 * the link mark and the space is inserted as usual. Pasting a URL over a
 * selection links the selection to it; pasting one with nothing selected
 * inserts it already linked. Needs the `link` mark in the editor.
 */
export function autolink(options: AutolinkOptions = {}): ExtensionDef {
  return {
    kind: 'extension',
    name: 'autolink',

    inputRules:
      options.onType === false
        ? []
        : [
            {
              // The whitespace at the end is the character just typed.
              match: /((?:https?:\/\/|www\.)[^\s<>"'`]+)\s$/i,
              handler: (ctx, match, range) => {
                const raw = match[1] ?? ''
                const href = normalizeUrl(raw)
                if (!href) return false
                const url = raw.replace(TRAILING, '')
                const from = (range.to - raw.length) as typeof range.to
                const to = (from + url.length) as typeof range.to
                if (!ctx.addMark('link', { href }, { from, to })) return false
                // The typed space, inserted after the link rather than inside it.
                return ctx.insert(match[0].slice(-1))
              },
            },
          ],

    handlePaste:
      options.onPaste === false
        ? undefined
        : (ctx, data) => {
            const text = data.text?.trim() ?? ''
            if (!text || /\s/.test(text) || !URL_LIKE.test(text)) return false
            const href = normalizeUrl(text)
            if (!href) return false
            const selection = ctx.selection
            if (!selection.empty) return ctx.addMark('link', { href })
            return ctx.insert({
              type: 'text',
              text,
              marks: [{ type: 'link', attrs: { href } }],
            })
          },
  }
}
