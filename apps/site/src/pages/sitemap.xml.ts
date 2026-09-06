import type { APIRoute } from 'astro'

/**
 * The sitemap is generated from the pages that exist, not from a list someone
 * has to remember to update. Add a page, it ships in the sitemap; delete one,
 * it leaves. A hand-kept list is a list that goes stale silently, and a
 * sitemap pointing at a 404 costs crawl budget on every fetch.
 */
// `import.meta.glob` is a Vite builtin. The repo's root tsconfig does not pull
// in Astro's client types, so it is reached through a narrow local cast rather
// than by widening the whole project's ImportMeta.
const pages = (
  import.meta as unknown as {
    glob: (pattern: string, options: { eager: boolean }) => Record<string, unknown>
  }
).glob('./**/*.astro', { eager: true })

/** Pages that exist for humans who took a wrong turn, not for the index. */
const EXCLUDE = new Set(['/404/'])

/**
 * Crawlers ration attention. These say where to spend it: the landing page and
 * the two pages someone evaluating Matra actually needs, then the docs, then
 * the legal pages nobody searches for.
 */
const priority = (route: string): string => {
  // Routes arrive slashed; compare against the bare path so the two forms
  // cannot drift apart the way they did once already.
  const path = route === '/' ? '/' : route.replace(/\/$/, '')
  if (path === '/') return '1.0'
  if (path === '/extensions' || path === '/pricing') return '0.9'
  if (path === '/docs') return '0.8'
  if (path.startsWith('/docs/')) return '0.7'
  return '0.4'
}

/**
 * Trailing slash matters here, and it has to match the canonical exactly.
 *
 * Astro builds with `format: 'directory'`, so every page is served at a path
 * ending in `/` and the canonical in Base.astro emits it that way. A sitemap
 * that lists the unslashed form hands the crawler a second URL for the same
 * page and invites it to pick the one the canonical disowns.
 */
const toRoute = (file: string): string => {
  const path = file
    .replace(/^\.\//, '/')
    .replace(/\.astro$/, '')
    .replace(/\/index$/, '')
  return path === '' ? '/' : `${path}/`
}

export const GET: APIRoute = ({ site }) => {
  const origin = (site ?? new URL('https://matrajs.com')).origin
  const lastmod = new Date().toISOString().slice(0, 10)

  const urls = Object.keys(pages)
    .map(toRoute)
    .filter((route) => !EXCLUDE.has(route))
    .sort()
    .map(
      (route) => `  <url>
    <loc>${origin}${route}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority(route)}</priority>
  </url>`,
    )
    .join('\n')

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  )
}
