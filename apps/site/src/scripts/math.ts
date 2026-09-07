/**
 * LaTeX into MathML, in about a hundred and fifty lines and no dependencies.
 *
 * `mathInline` and `mathBlock` store the source and draw nothing: the docs say
 * to plug in KaTeX or MathJax, and with nothing plugged in the extension shows
 * the source in a `<code>` — which is correct, and looks broken on a page whose
 * caption says "rendered where it stands".
 *
 * KaTeX would be 280 kB on a site whose entire argument is bundle size, so this
 * renders to MathML instead, which every current browser draws natively. It
 * covers the subset a demo needs — fractions, roots, sub- and superscripts,
 * big operators with limits, Greek, the common relations — and *throws* on
 * anything else, because the extension catches a throw and falls back to
 * showing the source. Failing to the source is right: a formula the renderer
 * cannot parse is still there to be read and fixed, rather than silently gone.
 *
 * Not a general LaTeX engine, and not pretending to be one. Bring KaTeX if you
 * need one; this is the demonstration that bringing anything at all is a
 * function you pass in.
 */

/** Named symbols, as the character the browser should draw. */
const SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  upsilon: 'υ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Gamma: 'Γ',
  Delta: 'Δ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Xi: 'Ξ',
  Pi: 'Π',
  Sigma: 'Σ',
  Phi: 'Φ',
  Psi: 'Ψ',
  Omega: 'Ω',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  forall: '∀',
  exists: '∃',
  emptyset: '∅',
  in: '∈',
  notin: '∉',
  subset: '⊂',
  subseteq: '⊆',
  cup: '∪',
  cap: '∩',
  neg: '¬',
  land: '∧',
  lor: '∨',
}

/** Operators, which MathML wants in `<mo>` so it gets the spacing right. */
const OPERATORS: Record<string, string> = {
  times: '×',
  div: '÷',
  cdot: '⋅',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  ne: '≠',
  neq: '≠',
  approx: '≈',
  equiv: '≡',
  sim: '∼',
  propto: '∝',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  mapsto: '↦',
  int: '∫',
  iint: '∬',
  oint: '∮',
  sum: '∑',
  prod: '∏',
  lim: 'lim',
}

/** Big operators take their limits under and over in display, beside inline. */
const BIG = new Set(['int', 'iint', 'oint', 'sum', 'prod', 'lim'])

/** Thin spaces, which a formula uses before `dx` and nowhere else that matters. */
const SPACES: Record<string, string> = {
  ',': '0.17em',
  ':': '0.22em',
  ';': '0.28em',
  '!': '-0.17em',
  ' ': '0.25em',
  quad: '1em',
  qquad: '2em',
}

const FRACTIONS = new Set(['frac', 'tfrac', 'dfrac'])

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

interface Atom {
  /** The MathML for the atom itself, before any scripts are attached. */
  xml: string
  /** True for `\int`, `\sum` and friends, whose limits go under and over. */
  big?: boolean
}

class Reader {
  private at = 0
  constructor(private readonly src: string) {}

  get done(): boolean {
    return this.at >= this.src.length
  }

  peek(): string {
    return this.src[this.at] ?? ''
  }

  next(): string {
    const char = this.src[this.at] ?? ''
    this.at += 1
    return char
  }

  /** A `\command`, without its backslash. Single non-letter commands count. */
  command(): string {
    let name = ''
    while (/[a-zA-Z]/.test(this.peek())) name += this.next()
    return name || this.next()
  }
}

/**
 * One atom: a group, a command, a number, or a single character.
 *
 * Numbers are read whole — `<mn>12</mn>`, not three of them — because MathML
 * spaces adjacent `<mn>` elements as separate numbers.
 */
function atom(read: Reader): Atom {
  const char = read.next()

  if (char === '{') return { xml: sequence(read, '}') }

  if (char === '\\') {
    const name = read.command()

    if (FRACTIONS.has(name)) {
      return { xml: `<mfrac>${group(read)}${group(read)}</mfrac>` }
    }
    if (name === 'sqrt') return { xml: `<msqrt>${group(read)}</msqrt>` }
    if (name === 'text' || name === 'mathrm') {
      return { xml: `<mtext>${stripTags(group(read))}</mtext>` }
    }
    if (name in SPACES) return { xml: `<mspace width="${SPACES[name]}"></mspace>` }
    if (name in OPERATORS) {
      return { xml: `<mo>${escapeText(OPERATORS[name] as string)}</mo>`, big: BIG.has(name) }
    }
    if (name in SYMBOLS) return { xml: `<mi>${escapeText(SYMBOLS[name] as string)}</mi>` }

    // Anything unrecognised · the extension falls back to showing the source.
    throw new Error(`unsupported command \\${name}`)
  }

  if (/[0-9]/.test(char)) {
    let digits = char
    while (/[0-9.]/.test(read.peek())) digits += read.next()
    return { xml: `<mn>${digits}</mn>` }
  }

  if (/[a-zA-Z]/.test(char)) return { xml: `<mi>${char}</mi>` }
  if (/\s/.test(char)) return { xml: '' }
  if (char === '(' || char === ')' || char === '[' || char === ']') {
    return { xml: `<mo stretchy="false">${escapeText(char)}</mo>` }
  }
  return { xml: `<mo>${escapeText(char)}</mo>` }
}

/**
 * The next atom as exactly one MathML element.
 *
 * Always wrapped, never conditionally. `<mfrac>`, `<msub>` and friends take a
 * fixed number of children, so a group of several atoms has to arrive as one —
 * and the first version of this tried to skip the wrapper for single atoms with
 * a regular expression over the markup it had just built, which is both harder
 * to read than the thing it saves and wrong for `\sqrt{a+b}`. A one-child
 * `<mrow>` costs nothing and is always correct.
 */
function group(read: Reader): string {
  return `<mrow>${atom(read).xml}</mrow>`
}

/** Atoms until `stop`, with `^` and `_` attached to whatever they follow. */
function sequence(read: Reader, stop?: string): string {
  let out = ''
  // Annotated, because the closure below assigns to it and TypeScript cannot
  // infer a type it is still in the middle of inferring.
  let previous: Atom | null = null

  const flush = () => {
    if (previous) out += previous.xml
    previous = null
  }

  while (!read.done) {
    if (stop && read.peek() === stop) {
      read.next()
      break
    }

    if (read.peek() === '^' || read.peek() === '_') {
      const marks: Record<string, string> = {}
      while (read.peek() === '^' || read.peek() === '_') {
        const kind = read.next()
        marks[kind] = group(read)
      }
      const held: Atom | null = previous
      const base: string = held?.xml || '<mrow></mrow>'
      const big: boolean = held?.big === true
      const sub = marks._
      const sup = marks['^']
      const tag: string = big
        ? sub && sup
          ? 'munderover'
          : sub
            ? 'munder'
            : 'mover'
        : sub && sup
          ? 'msubsup'
          : sub
            ? 'msub'
            : 'msup'
      previous = { xml: `<${tag}>${base}${sub ?? ''}${sup ?? ''}</${tag}>` }
      continue
    }

    flush()
    previous = atom(read)
  }

  flush()
  return out
}

const stripTags = (xml: string) => xml.replace(/<[^>]*>/g, '')

/** The whole formula, or a throw the caller turns back into source. */
export function toMathML(latex: string, display: boolean): string {
  const body = sequence(new Reader(latex))
  if (!body) throw new Error('nothing to render')
  return `<math xmlns="http://www.w3.org/1998/Math/MathML" display="${
    display ? 'block' : 'inline'
  }">${body}</math>`
}

/**
 * The function `mathKit` asks for.
 *
 * Throwing is the contract: the extension catches it and shows the source,
 * which is the right outcome for a formula this cannot parse.
 */
export function renderMath(latex: string, element: HTMLElement, display: boolean): void {
  element.innerHTML = toMathML(latex, display)
}
