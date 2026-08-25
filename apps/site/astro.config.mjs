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
  build: { inlineStylesheets: 'always' },
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
