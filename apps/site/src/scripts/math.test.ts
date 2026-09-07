import { describe, expect, it } from 'vitest'
import { toMathML } from './math'

/**
 * The renderer the playground plugs into `mathInline` and `mathBlock`.
 *
 * What matters is not that it is a complete LaTeX engine — it is not, and does
 * not claim to be — but that it renders the subset it claims and *throws* on
 * everything else. The extension catches a throw and shows the source, so
 * throwing is how an unsupported formula stays readable instead of vanishing.
 */
describe('rendering the formulas the playground ships', () => {
  it('an integral with limits, a thin space and a fraction', () => {
    const xml = toMathML('\\int_0^1 x^2\\,dx = \\tfrac{1}{3}', true)
    expect(xml).toContain('display="block"')
    // Limits under and over, because an integral is a big operator.
    expect(xml).toContain('<munderover>')
    expect(xml).toContain('∫')
    expect(xml).toContain('<msup><mi>x</mi><mrow><mn>2</mn></mrow></msup>')
    expect(xml).toContain('<mspace width="0.17em">')
    expect(xml).toContain('<mfrac>')
  })

  it("Euler's identity, inline", () => {
    const xml = toMathML('e^{i\\pi} + 1 = 0', false)
    expect(xml).toContain('display="inline"')
    expect(xml).toContain('<msup>')
    expect(xml).toContain('π')
  })
})

describe('the pieces', () => {
  it('reads a number whole rather than digit by digit', () => {
    expect(toMathML('120', false)).toContain('<mn>120</mn>')
  })

  it('attaches a subscript and a superscript to the same base', () => {
    expect(toMathML('x_1^2', false)).toContain('<msubsup>')
  })

  it('hands a root and a fraction exactly one child each', () => {
    expect(toMathML('\\sqrt{a+b}', false)).toContain(
      '<msqrt><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow></msqrt>',
    )
    expect(toMathML('\\frac{a+b}{c}', false)).toContain(
      '<mfrac><mrow><mi>a</mi><mo>+</mo><mi>b</mi></mrow><mrow><mi>c</mi></mrow></mfrac>',
    )
  })

  it('escapes what would otherwise be markup', () => {
    const xml = toMathML('a < b', false)
    expect(xml).toContain('&lt;')
    expect(xml).not.toContain('<mo><</mo>')
  })
})

describe('what it refuses', () => {
  it('throws on a command it does not know, so the source is shown instead', () => {
    expect(() => toMathML('\\begin{matrix}a\\end{matrix}', true)).toThrow()
    expect(() => toMathML('\\substack{x}', false)).toThrow()
  })

  it('throws on a formula with nothing in it', () => {
    expect(() => toMathML('   ', false)).toThrow()
  })
})
