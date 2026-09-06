import { defineConfig } from 'astro/config'

/**
 * The site's job is to be fast, because that is the claim it is making.
 *
 * Astro ships no JavaScript unless a page asks for some. The only page that
 * asks is the landing page, and what it asks for is the editor itself — which
 * is the point: the demo you type into is the product, at its real size.
 */
export default defineConfig({
  site: 'https://matrajs.com',
  // 'auto', not 'always': the font faces alone are several kilobytes, and
  // inlining them puts the same bytes in all twenty pages instead of letting
  // one cached stylesheet serve the whole site.
  build: { inlineStylesheets: 'auto' },
  compressHTML: true,
  vite: {
    build: {
      cssMinify: true,
      // One chunk. The editor is 22 kB; splitting it costs a round trip to
      // save nothing.
      //
      // The playground is the exception, and it does not need configuring
      // here: it imports core as '@matrajs/core?catalogue'. Vite treats a
      // query-suffixed specifier as a distinct module, which is the whole
      // trick. Core ships as one pre-bundled file, so Rollup cannot split it —
      // a page importing it gets the file, and tree-shaking is the only thing
      // that trims it. The playground offers all 76 extensions and so retains
      // all of them; sharing a module id with the landing page's editor meant
      // the landing page paid for the playground's catalogue. Measured: 53.9
      // kB before the playground existed, 73.7 kB while they shared, 53.9 kB
      // again once the suffix split them. The playground carries its own copy
      // in its own async chunk, which is the correct place for that weight.
      rollupOptions: { output: { manualChunks: undefined } },
    },
  },
})
