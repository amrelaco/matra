import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { createEditor, starterKit } from './matra-dist/index.js'

const out = []
const log = (s) => {
  out.push(s)
  document.getElementById('out').textContent = out.join('\n')
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

/**
 * Time a function, forcing layout each round so the DOM work is really done.
 *
 * Reported as the median of several samples. A single sample in a browser moved
 * a metric by 6x between runs on a change that could not affect it, which is
 * noise loud enough to invent a result.
 */
const time = (iterations, fn, host) => {
  for (let i = 0; i < 5; i++) {
    fn()
    void host.offsetHeight
  }
  const samples = []
  for (let s = 0; s < 7; s++) {
    const started = performance.now()
    for (let i = 0; i < iterations; i++) {
      fn()
      void host.offsetHeight
    }
    samples.push((performance.now() - started) / iterations)
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

const host = (id) => {
  const el = document.createElement('div')
  el.id = id
  el.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px'
  document.body.appendChild(el)
  return el
}

function run() {
  log(`user agent: ${navigator.userAgent}`)
  log('')
  log('operation                          matra    tiptap    ratio')
  log('-'.repeat(60))

  for (const n of [200, 2000]) {
    const doc = paragraphs(n)
    log('')
    log(`${n} paragraphs`)

    // --- mount + first paint -------------------------------------------------
    const a1 = host('m-mount')
    const b1 = host('t-mount')
    const mMount = time(
      5,
      () => {
        a1.replaceChildren()
        createEditor({ extensions: starterKit, content: doc }).mount(a1)
      },
      a1,
    )
    const tMount = time(
      5,
      () => {
        b1.replaceChildren()
        new Editor({ element: b1, extensions: [StarterKit], content: doc })
      },
      b1,
    )
    row('mount + first render', mMount, tMount)

    // --- typing --------------------------------------------------------------
    const a2 = host('m-type')
    const m = createEditor({ extensions: starterKit, content: doc })
    m.mount(a2)
    const b2 = host('t-type')
    const t = new Editor({ element: b2, extensions: [StarterKit], content: doc })

    row(
      'keystroke at start',
      time(
        300,
        () => {
          m.commands.select(1)
          m.commands.insert('a')
        },
        a2,
      ),
      time(
        300,
        () => {
          t.commands.insertContentAt(1, 'a')
        },
        b2,
      ),
    )

    row(
      'getHTML',
      time(20, () => m.getHTML(), a2),
      time(20, () => t.getHTML(), b2),
    )
    row(
      'getJSON',
      time(50, () => m.getJSON(), a2),
      time(50, () => t.getJSON(), b2),
    )
  }
  log('')
  log('DONE')
}

function row(label, a, b) {
  const f = (v) => v.toFixed(3).padStart(8)
  const ratio = a > 0 ? `${(b / a).toFixed(2)}x` : '-'
  log(`${label.padEnd(30)}${f(a)}${f(b)}   ${ratio.padStart(7)}`)
}

try {
  run()
} catch (error) {
  log(`ERROR: ${error instanceof Error ? error.stack : String(error)}`)
}
