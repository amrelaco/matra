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

const DANGEROUS_SCHEME = /^\s*(javascript|vbscript|data)\s*:/i
/** data: is only safe when it is genuinely an image. */
const SAFE_DATA = /^\s*data:image\/(png|jpe?g|gif|webp|avif|svg\+xml);/i

export function isSafeAttrName(name: string): boolean {
  return !EXECUTABLE_NAME.test(name) && !DOCUMENT_ATTR.has(name.toLowerCase())
}

/** Would setting this attribute to this value be safe? */
export function isSafeAttrValue(name: string, value: string): boolean {
  const lower = name.toLowerCase()
  if (!URL_ATTR.has(lower)) return true
  if (!DANGEROUS_SCHEME.test(value)) return true
  // A base64 png is a legitimate src; a data:text/html is a script in a coat.
  return lower === 'src' && SAFE_DATA.test(value)
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
  if (!isSafeAttrValue(name, text)) return
  dom.setAttribute(name, text)
}
