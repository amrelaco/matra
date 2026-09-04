#!/usr/bin/env node
/**
 * Install what we publish, the way a user does, in every framework.
 *
 * `packaging.mjs` proves the built packages import and require. This proves
 * the *published* packages install: each one is packed to a tarball exactly as
 * `pnpm publish` would send it, then installed with plain npm — which does not
 * know what `workspace:^` means, and is therefore the right tool to catch a
 * manifest pnpm would have quietly fixed — into a fresh Vite app for React,
 * Vue, Svelte, Solid and no framework at all. Each app is built, and the
 * built bundle is run in a DOM.
 *
 * Every app builds one editor out of every extension the package exports and
 * puts it through `matrix/exercise.js` — the same checks `exercise.mjs` runs
 * against the build here — then reports the outcome, and the final document,
 * through the binding's own way of hearing a change. So each framework proves
 * three things at once: the package installs, every extension works in it,
 * and the binding relays what happened.
 *
 *   node scripts/install-matrix.mjs            everything
 *   node scripts/install-matrix.mjs react vue   only these
 *   KEEP=1 node scripts/install-matrix.mjs      leave the scratch directory for a look
 *
 * Needs the registry for Vite and the frameworks; the Matra packages never
 * come from it. Run after `pnpm build`.
 */
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { browserlike } from './matrix/dom.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const PACKAGES = join(ROOT, 'packages')
const wanted = process.argv.slice(2)

const sh = (command, args, cwd, env = {}) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed in ${cwd}\n${result.stdout}\n${result.stderr}`,
    )
  }
  return result.stdout
}

/** Every package, packed. Returns name → tarball path. */
function pack(dir) {
  const tarballs = {}
  for (const entry of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const root = join(PACKAGES, entry.name)
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    if (!existsSync(join(root, 'dist'))) throw new Error(`${manifest.name} is not built`)
    const out = join(dir, 'tarballs')
    mkdirSync(out, { recursive: true })
    // pnpm pack rewrites workspace ranges to real versions, as publish does.
    sh('pnpm', ['pack', '--pack-destination', out], root)
    const file = readdirSync(out).find((entry) =>
      entry.startsWith(`${manifest.name.replace('@', '').replace('/', '-')}-`),
    )
    if (!file) throw new Error(`no tarball for ${manifest.name}`)
    tarballs[manifest.name] = join(out, file)
  }
  return tarballs
}

/**
 * The apps. Each builds the whole box into one editor, runs the exercise
 * after the editor is on screen, and prints the report with the document as
 * the binding last reported it — so `#proof` only reads right when the
 * binding relayed the very last change.
 */
const FINISH = `editor.setContent('<p>all done</p>')`
const APPS = {
  vanilla: {
    deps: {},
    plugins: [],
    files: {
      'src/main.js': `import * as core from '@matrajs/core'
import { everything, exercise } from './exercise.js'
const { defs, hooks } = everything(core, document)
const editor = core.createEditor({ extensions: defs, content: '<p>hello</p>' })
editor.mount(document.getElementById('app'))
let html = editor.getHTML()
editor.on('change', () => { html = editor.getHTML() })
exercise(editor, core, hooks, defs).then((report) => {
  ${FINISH}
  document.getElementById('proof').textContent = JSON.stringify({ ...report, html })
})
`,
    },
  },
  react: {
    deps: { react: '^18.3.1', 'react-dom': '^18.3.1', '@vitejs/plugin-react': '^4.3.4' },
    plugins: ["import react from '@vitejs/plugin-react'", 'react()'],
    files: {
      'src/main.jsx': `import { createRoot } from 'react-dom/client'
import * as core from '@matrajs/core'
import { EditorContent, useEditor, useEditorState } from '@matrajs/react'
import { useEffect, useState } from 'react'
import { everything, exercise } from './exercise.js'

function App() {
  const [box] = useState(() => everything(core, document))
  const editor = useEditor({ extensions: box.defs, content: '<p>hello</p>' })
  const html = useEditorState(editor, (e) => e.getHTML())
  const [report, setReport] = useState(null)
  useEffect(() => {
    exercise(editor, core, box.hooks, box.defs).then((result) => {
      ${FINISH}
      setReport(result)
    })
  }, [editor, box])
  return <><EditorContent editor={editor} /><pre id="proof">{report ? JSON.stringify({ ...report, html }) : ''}</pre></>
}
createRoot(document.getElementById('app')).render(<App />)
`,
    },
  },
  vue: {
    deps: { vue: '^3.5.13', '@vitejs/plugin-vue': '^5.2.1' },
    plugins: ["import vue from '@vitejs/plugin-vue'", 'vue()'],
    files: {
      'src/main.js': `import { createApp, defineComponent, h, onMounted, ref } from 'vue'
import * as core from '@matrajs/core'
import { EditorContent, useEditor, useEditorState } from '@matrajs/vue'
import { everything, exercise } from './exercise.js'

const App = defineComponent({
  setup() {
    const { defs, hooks } = everything(core, document)
    const editor = useEditor({ extensions: defs, content: '<p>hello</p>' })
    const html = useEditorState(editor, (e) => e.getHTML())
    const report = ref(null)
    onMounted(async () => {
      const result = await exercise(editor, core, hooks, defs)
      ${FINISH}
      report.value = result
    })
    return () => [
      h(EditorContent, { editor }),
      h('pre', { id: 'proof' }, report.value ? JSON.stringify({ ...report.value, html: html.value }) : ''),
    ]
  },
})
createApp(App).mount('#app')
`,
    },
  },
  svelte: {
    deps: { svelte: '^5.0.0', '@sveltejs/vite-plugin-svelte': '^5.0.3' },
    plugins: ["import { svelte } from '@sveltejs/vite-plugin-svelte'", 'svelte()'],
    files: {
      'src/App.svelte': `<script>
  import * as core from '@matrajs/core'
  import { matra } from '@matrajs/svelte'
  import { onMount } from 'svelte'
  import { everything, exercise } from './exercise.js'
  const { defs, hooks } = everything(core, document)
  const { action, editor, state } = matra({ extensions: defs, content: '<p>hello</p>' })
  let report = null
  onMount(async () => {
    const result = await exercise(editor, core, hooks, defs)
    ${FINISH}
    report = result
  })
</script>
<div use:action></div>
<pre id="proof">{report ? JSON.stringify({ ...report, html: $state.getHTML() }) : ''}</pre>
`,
      'src/main.js': `import { mount } from 'svelte'
import App from './App.svelte'
mount(App, { target: document.getElementById('app') })
`,
    },
  },
  solid: {
    deps: { 'solid-js': '^1.9.3', 'vite-plugin-solid': '^2.11.0' },
    plugins: ["import solid from 'vite-plugin-solid'", 'solid()'],
    files: {
      'src/main.jsx': `import { render } from 'solid-js/web'
import { createSignal, onMount } from 'solid-js'
import * as core from '@matrajs/core'
import { createMatra } from '@matrajs/solid'
import { everything, exercise } from './exercise.js'

function App() {
  const { defs, hooks } = everything(core, document)
  const { editor, mount, state } = createMatra({ extensions: defs, content: '<p>hello</p>' })
  const [report, setReport] = createSignal(null)
  onMount(async () => {
    const result = await exercise(editor, core, hooks, defs)
    ${FINISH}
    setReport(result)
  })
  return <><div ref={mount} /><pre id="proof">{report() ? JSON.stringify({ ...report(), html: state().getHTML() }) : ''}</pre></>
}
render(() => <App />, document.getElementById('app'))
`,
    },
  },
}

const BINDING = {
  react: '@matrajs/react',
  vue: '@matrajs/vue',
  svelte: '@matrajs/svelte',
  solid: '@matrajs/solid',
}

function writeApp(dir, name, app, tarballs) {
  const root = join(dir, name)
  mkdirSync(join(root, 'src'), { recursive: true })
  const deps = { '@matrajs/core': tarballs['@matrajs/core'], ...app.deps }
  if (BINDING[name]) deps[BINDING[name]] = tarballs[BINDING[name]]
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: `matra-${name}`,
        private: true,
        type: 'module',
        dependencies: deps,
        devDependencies: { vite: '^6.3.5' },
      },
      null,
      2,
    ),
  )
  const entry = Object.keys(app.files).find((file) => file.startsWith('src/main'))
  writeFileSync(
    join(root, 'index.html'),
    `<!doctype html><html><body><div id="app"></div><pre id="proof"></pre><script type="module" src="/${entry}"></script></body></html>`,
  )
  const [pluginImport, pluginCall] = app.plugins.length ? app.plugins : ['', '']
  writeFileSync(
    join(root, 'vite.config.js'),
    `${pluginImport}\nexport default { base: './', plugins: [${pluginCall}], build: { minify: false, modulePreload: false, rollupOptions: { output: { manualChunks: undefined, format: 'es' } } } }\n`,
  )
  for (const [file, content] of Object.entries(app.files))
    writeFileSync(join(root, file), content)
  copyFileSync(join(ROOT, 'scripts/matrix/exercise.js'), join(root, 'src/exercise.js'))
  return root
}

/** Run the built app in happy-dom and wait for the report. */
async function smoke(root) {
  const window = await browserlike()
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8')
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
  window.document.body.innerHTML = '<div id="app"></div><pre id="proof"></pre>'
  for (const script of scripts) {
    await import(pathToFileURL(join(root, 'dist', script.replace(/^\.\//, ''))).href)
  }
  // The exercise takes a moment: menus wait for a frame, autosave for a pause.
  const started = Date.now()
  let report = null
  while (Date.now() - started < 30_000) {
    await new Promise((done) => setTimeout(done, 50))
    // The static <pre> from index.html, or the one the framework rendered.
    const text = [...window.document.querySelectorAll('#proof')]
      .map((node) => node.textContent ?? '')
      .join('')
    if (text.startsWith('{')) {
      report = JSON.parse(text)
      break
    }
  }
  const mounted = window.document.querySelector('.matra-editor') !== null
  return { report, mounted }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'matra-matrix-'))
  const cache = join(tmpdir(), 'matra-matrix-npm-cache')
  console.log(`scratch: ${dir}`)
  const tarballs = pack(dir)
  console.log(`packed ${Object.keys(tarballs).length} packages`)

  const names = Object.keys(APPS).filter((name) => !wanted.length || wanted.includes(name))
  const failures = []
  const counts = new Map()
  for (const name of names) {
    const started = Date.now()
    try {
      const root = writeApp(dir, name, APPS[name], tarballs)
      sh(
        'npm',
        ['install', '--no-audit', '--no-fund', '--loglevel=error', `--cache=${cache}`],
        root,
      )
      sh('npx', ['vite', 'build', '--logLevel', 'error'], root)
      const { report, mounted } = await smoke(root)
      if (!mounted) throw new Error('the editor did not mount')
      if (!report) throw new Error('no report within 30s')
      const failed = report.results.filter((row) => !row.ok)
      if (failed.length) {
        throw new Error(
          `${failed.length} checks failed\n${failed.map((row) => `    ${row.name} · ${row.detail}`).join('\n')}`,
        )
      }
      if (report.uncovered.length) {
        throw new Error(`no check covers: ${report.uncovered.join(', ')}`)
      }
      if (!report.html.includes('all done')) {
        throw new Error(`the binding did not report the last change · html was ${report.html}`)
      }
      counts.set(name, report.count)
      console.log(
        `  ok   ${name.padEnd(8)} installed, built, ran · ${report.count} extensions, ${report.checks} checks · ${((Date.now() - started) / 1000).toFixed(1)}s`,
      )
    } catch (error) {
      failures.push(name)
      console.error(
        `  FAIL ${name}\n${String(error.message ?? error)
          .split('\n')
          .slice(0, 30)
          .join('\n')}`,
      )
    }
  }
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
  if (failures.length) {
    console.error(`\ninstall matrix failed: ${failures.join(', ')}`)
    process.exit(1)
  }
  // Every framework saw the same box.
  if (new Set(counts.values()).size > 1) {
    console.error(
      `\nthe apps disagree on how many extensions there are: ${[...counts].join(' ')}`,
    )
    process.exit(1)
  }
  console.log(
    `\n${names.length} apps install, build and run every extension from the packed packages`,
  )
}

await main()
