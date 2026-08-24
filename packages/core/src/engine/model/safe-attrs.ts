/**
 * The last gate before an attribute reaches the DOM.
 *
 * Extensions validate their own attributes, but validation that lives only in
 * `parseDOM` and in commands is bypassed the moment a document is loaded from
 * JSON — which is how every real application loads documents. This runs on the
 * rendering path instead, so every route into the DOM passes through it.
 */

/** Attributes that execute code, whatever their value. */
const EXECUTABLE_NAME = /^on/i

/** Attributes whose value is fetched or navigated to. */
const URL_ATTR = new Set([
  'href',
  'src',
  'xlink:href',
  'action',
  'formaction',
  'poster',
  'data',
])

/** Attributes that carry a whole document. */
const DOCUMENT_ATTR = new Set(['srcdoc'])

const DANGEROUS_SCHEME = /^(javascript|vbscript|data):/i
/** data: is only safe when it is genuinely an image. */
const SAFE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i

/**
 * `//evil.example` inherits the page's protocol and leaves the site. It reads
 * like a path and is almost never what a document author meant.
 */
const PROTOCOL_RELATIVE = /^\/\//

/**
 * What the browser will resolve, rather than what the string looks like.
 *
 * Tab, newline, carriage return and NUL are stripped from a URL before its
 * scheme is read, so `java&#9;script:` is `javascript:` by the time it matters.
 * Testing the raw string instead of the normalised one is how scheme filters
 * get bypassed.
 */
function normalizeUrl(value: string): string {
  return value.replace(/[\t\n\r\0]/g, '').trim()
}

export function isSafeAttrName(name: string): boolean {
  return !EXECUTABLE_NAME.test(name) && !DOCUMENT_ATTR.has(name.toLowerCase())
}

/** Would setting this attribute to this value be safe? */
export function isSafeAttrValue(name: string, value: string, tag = ''): boolean {
  const lower = name.toLowerCase()
  if (!URL_ATTR.has(lower)) return true
  const url = normalizeUrl(value)
  if (PROTOCOL_RELATIVE.test(url)) return false
  if (!DANGEROUS_SCHEME.test(url)) return true
  // A base64 png on an <img> is a legitimate inline image. The same bytes on an
  // <iframe> or an <object> are a document, and an SVG document runs scripts —
  // so the tag decides, not the attribute name alone.
  return lower === 'src' && tag === 'IMG' && SAFE_DATA.test(url)
}

/**
 * Fix up an element once all of its attributes are set.
 *
 * Some rules cannot be judged one attribute at a time. `target="_blank"` hands
 * the opened page a `window.opener` handle it can use to navigate this tab
 * somewhere else, so it is only safe next to `rel="noopener"` — and a document
 * loaded from JSON is free to supply the target while blanking the rel.
 */
export function finalizeElement(dom: Element): void {
  if (dom.getAttribute('target') !== '_blank') return
  const rel = new Set((dom.getAttribute('rel') ?? '').split(/\s+/).filter(Boolean))
  rel.add('noopener')
  rel.add('noreferrer')
  dom.setAttribute('rel', [...rel].join(' '))
}

/**
 * Set an attribute, or refuse it.
 *
 * Refusing silently is deliberate: an attacker should learn nothing, and an
 * honest extension that trips this has a bug worth finding in review rather
 * than an exception in production.
 */
export function setSafeAttribute(dom: Element, name: string, value: unknown): void {
  if (value === null || value === undefined || value === false) return
  if (!isSafeAttrName(name)) return
  const text = String(value)
  if (!isSafeAttrValue(name, text, dom.tagName)) return
  dom.setAttribute(name, text)
}
