/**
 * One place that decides whether a string is a colour.
 *
 * The value lands in a `style` attribute, and a style attribute is a place
 * where `red; background: url(x)` is a second declaration and `expression(…)`
 * was once code. Matching the whole string against the shapes a colour can
 * take is what keeps it one value, and it is checked three times over: coming
 * from a command, coming from pasted HTML, and going back out to the DOM.
 *
 * Lives here rather than in the extension that needed it first, because the
 * second and third extensions to need it copied the pattern, and a
 * security-critical regular expression maintained in three places is one that
 * will be corrected in one of them.
 */
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\)|[a-z]{3,30})$/i

/** The colour as it will be written, or null when the value is not one. */
export function colorOf(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && COLOR.test(text) ? text : null
}
