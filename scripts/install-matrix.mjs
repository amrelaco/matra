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
 * built bundle is run in a DOM: the editor has to mount, take a command, and
 * report the change through the binding.
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
 * The apps. Each is the smallest thing that proves the binding works: an
 * editor, one command, and the binding's own way of hearing the change. The
 * smoke test reads `#proof` after the command has run.
 */
const APPS = {
  vanilla: {
    deps: {},
    plugins: [],
    files: {
      'src/main.js': `import { createEditor, starterKit } from '@matrajs/core'
const editor = createEditor({ extensions: starterKit, content: '<p>hello</p>' })
editor.mount(document.getElementById('app'))
editor.on('change', () => { document.getElementById('proof').textContent = editor.getHTML() })
editor.commands.select({ from: 1, to: 6 })
editor.commands.toggleBold()
`,
    },
  },
  react: {
    deps: { react: '^18.3.1', 'react-dom': '^18.3.1', '@vitejs/plugin-react': '^4.3.4' },
    plugins: ["import react from '@vitejs/plugin-react'", 'react()'],
    files: {
      'src/main.jsx': `import { createRoot } from 'react-dom/client'
import { starterKit } from '@matrajs/core'
import { EditorContent, useEditor, useEditorState } from '@matrajs/react'
import { useEffect } from 'react'

function App() {
  const editor = useEditor({ extensions: starterKit, content: '<p>hello</p>' })
  const html = useEditorState(editor, (e) => e.getHTML())
  useEffect(() => {
    editor.commands.select({ from: 1, to: 6 })
    editor.commands.toggleBold()
  }, [editor])
  return <><EditorContent editor={editor} /><pre id="proof">{html}</pre></>
}
createRoot(document.getElementById('app')).render(<App />)
`,
    },
  },
  vue: {
    deps: { vue: '^3.5.13', '@vitejs/plugin-vue': '^5.2.1' },
    plugins: ["import vue from '@vitejs/plugin-vue'", 'vue()'],
    files: {
      'src/main.js': `import { createApp, defineComponent, h, onMounted } from 'vue'
import { starterKit } from '@matrajs/core'
import { EditorContent, useEditor, useEditorState } from '@matrajs/vue'

const App = defineComponent({
  setup() {
    const editor = useEditor({ extensions: starterKit, content: '<p>hello</p>' })
    const html = useEditorState(editor, (e) => e.getHTML())
    onMounted(() => {
      editor.commands.select({ from: 1, to: 6 })
      editor.commands.toggleBold()
    })
    return () => [h(EditorContent, { editor }), h('pre', { id: 'proof' }, html.value)]
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
  import { starterKit } from '@matrajs/core'
  import { matra } from '@matrajs/svelte'
  import { onMount } from 'svelte'
  const { action, editor, state } = matra({ extensions: starterKit, content: '<p>hello</p>' })
  onMount(() => {
    editor.commands.select({ from: 1, to: 6 })
    editor.commands.toggleBold()
  })
</script>
<div use:action></div>
<pre id="proof">{$state.getHTML()}</pre>
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
import { onMount } from 'solid-js'
import { starterKit } from '@matrajs/core'
import { createMatra } from '@matrajs/solid'

function App() {
  const { editor, mount, state } = createMatra({ extensions: starterKit, content: '<p>hello</p>' })
  onMount(() => {
    editor.commands.select({ from: 1, to: 6 })
    editor.commands.toggleBold()
  })
  return <><div ref={mount} /><pre id="proof">{state().getHTML()}</pre></>
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
    `${pluginImport}\nexport default { plugins: [${pluginCall}], build: { minify: false, modulePreload: false, rollupOptions: { output: { manualChunks: undefined, format: 'es' } } } }\n`,
  )
  for (const [file, content] of Object.entries(app.files))
    writeFileSync(join(root, file), content)
  return root
}

/** Run the built app in happy-dom and read the proof. */
async function smoke(root) {
  const { Window } = await import(
    pathToFileURL(join(ROOT, 'node_modules/happy-dom/lib/index.js')).href
  )
  const window = new Window({ url: 'http://localhost/' })
  const html = readFileSync(join(root, 'dist/index.html'), 'utf8')
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])
  window.document.body.innerHTML = '<div id="app"></div><pre id="proof"></pre>'
  for (const key of [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'Text',
    'DocumentFragment',
    'MutationObserver',
    'getSelection',
    'DOMParser',
    'navigator',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getComputedStyle',
    'CustomEvent',
    'Event',
    'KeyboardEvent',
    'MouseEvent',
    'SVGElement',
    'HTMLIFrameElement',
    'DocumentFragment',
    'Comment',
  ]) {
    try {
      globalThis[key] = key === 'window' ? window : window[key]
    } catch {}
  }
  for (const script of scripts) {
    await import(pathToFileURL(join(root, 'dist', script)).href)
  }
  // Frameworks flush on a tick.
  await new Promise((done) => setTimeout(done, 50))
  // The static <pre> from index.html, or the one the framework rendered.
  const proof = [...window.document.querySelectorAll('#proof')]
    .map((node) => node.textContent ?? '')
    .join('')
  const mounted = window.document.querySelector('.matra-editor') !== null
  return { proof, mounted }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'matra-matrix-'))
  const cache = join(tmpdir(), 'matra-matrix-npm-cache')
  console.log(`scratch: ${dir}`)
  const tarballs = pack(dir)
  console.log(`packed ${Object.keys(tarballs).length} packages`)

  const names = Object.keys(APPS).filter((name) => !wanted.length || wanted.includes(name))
  const failures = []
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
      const { proof, mounted } = await smoke(root)
      if (!mounted) throw new Error('the editor did not mount')
      if (!proof.includes('<strong>hello</strong>')) {
        throw new Error(
          `the binding did not report the change · proof was ${JSON.stringify(proof)}`,
        )
      }
      console.log(
        `  ok   ${name.padEnd(8)} installed, built, ran · ${((Date.now() - started) / 1000).toFixed(1)}s`,
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
  console.log(`\n${names.length} apps install, build and run from the packed packages`)
}

await main()
