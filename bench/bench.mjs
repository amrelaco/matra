import { performance } from 'node:perf_hooks'
/**
 * Benchmarks, run against the built bundle rather than the source.
 *
 * Numbers here go on the website, so they are measured the way a user would
 * experience them: a real document, a real transaction stream, a real DOM.
 */
import { Window } from 'happy-dom'

const w = new Window({ url: 'https://bench.test' })
for (const k of [
  'window',
  'document',
  'Node',
  'Element',
  'DocumentFragment',
  'Text',
  'MutationObserver',
  'getSelection',
  'DOMParser',
  'HTMLElement',
]) {
  try {
    globalThis[k] = k === 'window' ? w : w[k]
  } catch {}
}

const { createEditor, starterKit } = await import('../packages/core/dist/index.js')

const bench = (name, iterations, fn) => {
  fn()
  fn() // warm the JIT before measuring
  const started = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const total = performance.now() - started
  const each = total / iterations
  console.log(`${name.padEnd(42)} ${each.toFixed(4).padStart(10)} ms   (${iterations}x)`)
  return each
}

const paragraphs = (n) => ({
  type: 'doc',
  content: Array.from({ length: n }, (_, i) => ({
    type: 'paragraph',
    content: [
      {
        type: 'text',
        text: `Paragraph ${i} with a reasonable amount of ordinary prose in it.`,
      },
    ],
  })),
})

const results = {}
console.log('\n— document —')
const small = paragraphs(50)
const large = paragraphs(2000)

results.create = bench('create editor (50 paragraphs)', 200, () => {
  createEditor({ extensions: starterKit, content: small })
})
results.parseLarge = bench('setContent JSON (2000 paragraphs)', 20, () => {
  const e = createEditor({ extensions: starterKit })
  e.setContent(large)
})
const big = createEditor({ extensions: starterKit, content: large })
results.getHTML = bench('getHTML (2000 paragraphs)', 20, () => big.getHTML())
results.getJSON = bench('getJSON (2000 paragraphs)', 50, () => big.getJSON())
results.getText = bench('getText (2000 paragraphs)', 50, () => big.getText())

console.log('\n— editing —')
const typing = createEditor({ extensions: starterKit, content: small })
results.insert = bench('insert one character', 2000, () => {
  typing.commands.select(1)
  typing.commands.insert('x')
})
const marking = createEditor({ extensions: starterKit, content: small })
results.mark = bench('toggle bold over a range', 2000, () => {
  marking.commands.select({ from: 1, to: 20 })
  marking.commands.toggleBold()
})

console.log('\n— view —')
const el = w.document.createElement('div')
w.document.body.appendChild(el)
const mounted = createEditor({ extensions: starterKit, content: paragraphs(500) })
mounted.mount(el)
results.keystroke = bench('keystroke, mounted (500 paragraphs)', 500, () => {
  mounted.commands.select(1)
  mounted.commands.insert('a')
})

console.log('\n— summary —')
console.log(JSON.stringify(results, null, 2))
