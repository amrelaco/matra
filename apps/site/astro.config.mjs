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
      rollupOptions: { output: { manualChunks: undefined } },
    },
  },
})
