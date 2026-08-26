import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { registerRichText } from '@lexical/rich-text'
/**
 * Matra against Tiptap, Lexical and Slate — one browser, one run.
 *
 * Four editors in the same page and the same engine, because numbers taken from
 * different browsers do not belong in one table. Each figure is the median of
 * seven samples after five warm-up rounds, with a forced layout read every
 * round so the DOM work is really done.
 *
 * Each editor is driven through its own idiomatic API. That is the only fair
 * way to do it and it is also the only honest caveat: Slate and Lexical are
 * loaded with the rich-text behaviour their own quick-start prescribes, which
 * is not the same feature set as Matra's or Tiptap's starter kits.
 */
import { Editor as TiptapEditor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import * as lex from 'lexical'
import React from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Transforms, createEditor as createSlate } from 'slate'
import { Editable, Slate, withReact } from 'slate-react'
import { createEditor as createMatra, starterKit } from './matra-dist/index.js'

const out = []
const log = (s) => {
  out.push(s)
  document.getElementById('out').textContent = out.join('\n')
}

const N = 2000
const SMALL = 200
const line = (i) => `Paragraph ${i} with a reasonable amount of ordinary prose in it.`

const matraDoc = (n) => ({
  type: 'doc',
  content: Array.from({ length: n }, (_, i) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: line(i) }],
  })),
})
const html = (n) => Array.from({ length: n }, (_, i) => `<p>${line(i)}</p>`).join('')
const slateDoc = (n) =>
  Array.from({ length: n }, (_, i) => ({ type: 'paragraph', children: [{ text: line(i) }] }))

/**
 * Time `fn`, with the layout it caused, and tear down afterwards.
 *
 * `fn` may return a teardown. It is called after the clock stops, and that
 * detail decides the whole mount row: an editor that detaches its DOM before
 * the layout read never pays for laying its document out, and the browser's
 * cost — most of the row — silently lands on whoever is still on screen. This
 * harness ran that way for a while and reported Lexical at half Matra's mount
 * because Lexical's teardown ran first.
 */
const time = (iterations, fn, host) => {
  const once = () => {
    const stop = fn()
    void host.offsetHeight
    if (typeof stop === 'function') stop()
  }
  for (let i = 0; i < 5; i++) once()

  const samples = []
  for (let s = 0; s < 7; s++) {
    const stops = []
    const started = performance.now()
    for (let i = 0; i < iterations; i++) {
      const stop = fn()
      void host.offsetHeight
      if (typeof stop === 'function') stops.push(stop)
    }
    samples.push((performance.now() - started) / iterations)
    for (const stop of stops) stop()
  }
  samples.sort((a, b) => a - b)
  return samples[Math.floor(samples.length / 2)]
}

const host = () => {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;left:-99999px;top:0;width:800px'
  document.body.appendChild(el)
  return el
}

const results = {}
const put = (op, name, ms) => {
  results[op] = results[op] || {}
  results[op][name] = Number(ms.toFixed(3))
  log(`${op} · ${name} = ${ms.toFixed(3)} ms`)
}

// --- Lexical helpers --------------------------------------------------------
const lexicalMount = (h, n) => {
  const root = document.createElement('div')
  root.contentEditable = 'true'
  h.appendChild(root)
  const e = lex.createEditor({
    namespace: 'b',
    onError: (err) => {
      throw err
    },
  })
  e.setRootElement(root)
  registerRichText(e)
  e.update(
    () => {
      const r = lex.$getRoot()
      r.clear()
      for (let i = 0; i < n; i++) {
        const p = lex.$createParagraphNode()
        p.append(lex.$createTextNode(line(i)))
        r.append(p)
      }
    },
    { discrete: true },
  )
  return e
}

// --- Slate helpers ----------------------------------------------------------
const slateMount = (h, n) => {
  const point = document.createElement('div')
  h.appendChild(point)
  const editor = withReact(createSlate())
  const root = createRoot(point)
  // React renders concurrently by default, so without this the measurement
  // stops before the editor exists and the next operation runs on an empty doc.
  flushSync(() => {
    root.render(
      React.createElement(
        Slate,
        { editor, initialValue: slateDoc(n) },
        React.createElement(Editable),
      ),
    )
  })
  return { editor, root }
}

// --- the floor --------------------------------------------------------------
/**
 * The same paragraphs, with no editor involved at all.
 *
 * Mount is mostly the browser: creating two hundred elements and laying them
 * out costs what it costs, and no editor can go faster than that. Without this
 * row the mount numbers look like a comparison of four editors when they are
 * mostly a comparison of one browser with itself, and a difference smaller than
 * the floor's own run-to-run swing gets read as a result.
 */
const floorAt = (n, label) => {
  const h = host()
  // contenteditable, because every editor here is putting its paragraphs into
  // one and the browser charges more for it — a floor that skips it is not the
  // floor these numbers are standing on.
  h.contentEditable = 'true'
  put(
    label,
    'none',
    time(
      1,
      () => {
        h.replaceChildren()
        const f = document.createDocumentFragment()
        for (let i = 0; i < n; i++) {
          const p = document.createElement('p')
          p.appendChild(document.createTextNode(line(i)))
          f.appendChild(p)
        }
        h.appendChild(f)
      },
      h,
    ),
  )
  h.remove()
}

/**
 * Did that mount actually put the document on screen?
 *
 * A mount that returns before its DOM exists is not a mount, and it is the
 * cheapest possible way to win this row. The same reason Slate's keystroke is
 * checked rather than trusted: the first version of that reported a twentieth
 * of everyone else because React had not rendered yet.
 */
const drawn = (h, n) => h.textContent.includes(line(n - 1))

/**
 * Report the time only if the last paragraph is on screen.
 *
 * Text rather than tags, because the four of them do not agree on what a block
 * renders as; the last paragraph rather than any, because a reconciler that
 * gets halfway is the failure worth catching.
 */
const verified = (label, name, n, h, ms, mountOnce) => {
  h.replaceChildren()
  const live = mountOnce()
  const ok = drawn(h, n)
  live?.()
  if (ok) put(label, name, ms)
  else log(`${label} - ${name} = NOT MEASURED, the document was not on screen`)
}

// --- mount and first render -------------------------------------------------
const mountAt = (n, label) => {
  {
    const h = host()
    const ms = time(
      1,
      () => {
        h.replaceChildren()
        const e = createMatra({ extensions: starterKit, content: matraDoc(n) })
        e.mount(h)
        return () => e.destroy()
      },
      h,
    )
    verified(label, 'matra', n, h, ms, () => {
      const e = createMatra({ extensions: starterKit, content: matraDoc(n) })
      e.mount(h)
      return () => e.destroy()
    })
    h.remove()
  }
  {
    const h = host()
    const ms = time(
      1,
      () => {
        h.replaceChildren()
        const e = new TiptapEditor({ element: h, extensions: [StarterKit], content: html(n) })
        return () => e.destroy()
      },
      h,
    )
    verified(label, 'tiptap', n, h, ms, () => {
      const e = new TiptapEditor({ element: h, extensions: [StarterKit], content: html(n) })
      return () => e.destroy()
    })
    h.remove()
  }
  {
    const h = host()
    const ms = time(
      1,
      () => {
        h.replaceChildren()
        const e = lexicalMount(h, n)
        return () => e.setRootElement(null)
      },
      h,
    )
    verified(label, 'lexical', n, h, ms, () => {
      const e = lexicalMount(h, n)
      return () => e.setRootElement(null)
    })
    h.remove()
  }
  {
    const h = host()
    const ms = time(
      1,
      () => {
        h.replaceChildren()
        const { root } = slateMount(h, n)
        return () => flushSync(() => root.unmount())
      },
      h,
    )
    verified(label, 'slate', n, h, ms, () => {
      const { root } = slateMount(h, n)
      return () => flushSync(() => root.unmount())
    })
    h.remove()
  }
}

// --- keystroke --------------------------------------------------------------
const keystroke = (n, label) => {
  {
    const h = host()
    const e = createMatra({ extensions: starterKit, content: matraDoc(n) })
    e.mount(h)
    put(
      label,
      'matra',
      time(
        60,
        () => {
          e.commands.select(1)
          e.commands.insert('a')
        },
        h,
      ),
    )
    e.destroy()
    h.remove()
  }
  {
    const h = host()
    const e = new TiptapEditor({ element: h, extensions: [StarterKit], content: html(n) })
    put(
      label,
      'tiptap',
      time(
        60,
        () => {
          e.commands.setTextSelection(1)
          e.commands.insertContent('a')
        },
        h,
      ),
    )
    e.destroy()
    h.remove()
  }
  {
    const h = host()
    const e = lexicalMount(h, n)
    put(
      label,
      'lexical',
      time(
        60,
        () => {
          e.update(
            () => {
              const first = lex.$getRoot().getFirstChild()
              const text = first.getFirstChild()
              text.setTextContent(`a${text.getTextContent()}`)
            },
            { discrete: true },
          )
        },
        h,
      ),
    )
    e.setRootElement(null)
    h.remove()
  }
  {
    const h = host()
    const { editor, root } = slateMount(h, n)
    // A measurement that never changed the screen is not a keystroke. React
    // renders on its own schedule, and a transform that returns before the
    // paint would time the model update alone — which is why the first run of
    // this reported Slate at a twentieth of everything else.
    const before = h.textContent.slice(0, 40)
    const ms = time(
      60,
      () => {
        flushSync(() => {
          Transforms.insertText(editor, 'a', { at: { path: [0, 0], offset: 0 } })
        })
      },
      h,
    )
    const after = h.textContent.slice(0, 40)
    if (before === after) log(`${label} - slate = NOT MEASURED, the DOM never changed`)
    else put(label, 'slate', ms)
    flushSync(() => root.unmount())
    h.remove()
  }
}

// --- serialise --------------------------------------------------------------
const serialise = () => {
  const label = 'Serialise to HTML'
  {
    const h = host()
    const e = createMatra({ extensions: starterKit, content: matraDoc(N) })
    e.mount(h)
    put(
      label,
      'matra',
      time(1, () => e.getHTML(), h),
    )
    e.destroy()
    h.remove()
  }
  {
    const h = host()
    const e = new TiptapEditor({ element: h, extensions: [StarterKit], content: html(N) })
    put(
      label,
      'tiptap',
      time(1, () => e.getHTML(), h),
    )
    e.destroy()
    h.remove()
  }
  {
    const h = host()
    const e = lexicalMount(h, N)
    put(
      label,
      'lexical',
      time(
        1,
        () => {
          e.getEditorState().read(() => $generateHtmlFromNodes(e, null))
        },
        h,
      ),
    )
    e.setRootElement(null)
    h.remove()
  }
}

// --- parse ------------------------------------------------------------------
const parse = () => {
  const label = 'Parse a document'
  const doc = html(N)
  {
    const h = host()
    put(
      label,
      'matra',
      time(
        1,
        () => {
          createMatra({ extensions: starterKit, content: doc })
        },
        h,
      ),
    )
    h.remove()
  }
  {
    const h = host()
    put(
      label,
      'tiptap',
      time(
        1,
        () => {
          const e = new TiptapEditor({ extensions: [StarterKit], content: doc })
          e.destroy()
        },
        h,
      ),
    )
    h.remove()
  }
  {
    const h = host()
    const e = lexicalMount(h, 1)
    put(
      label,
      'lexical',
      time(
        1,
        () => {
          e.update(
            () => {
              const dom = new DOMParser().parseFromString(doc, 'text/html')
              const nodes = $generateNodesFromDOM(e, dom)
              const r = lex.$getRoot()
              r.clear()
              r.append(...nodes)
            },
            { discrete: true },
          )
        },
        h,
      ),
    )
    e.setRootElement(null)
    h.remove()
  }
}

log(`user agent: ${navigator.userAgent}`)
log('')
floorAt(SMALL, `Plain DOM, no editor, ${SMALL} paragraphs`)
floorAt(N, `Plain DOM, no editor, ${N} paragraphs`)
mountAt(SMALL, `Mount and first render, ${SMALL} paragraphs`)
mountAt(N, `Mount and first render, ${N} paragraphs`)
keystroke(SMALL, `Keystroke, ${SMALL} paragraphs`)
keystroke(N, `Keystroke, ${N} paragraphs`)
serialise()
parse()
log('')
log('JSON:')
log(JSON.stringify(results))
log('DONE')
