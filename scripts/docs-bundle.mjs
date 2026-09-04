#!/usr/bin/env node
/**
 * Gather the documentation into the pages `@matrajs/mcp` serves.
 *
 * Two sources. The repository's Markdown is copied as it is. The site's docs
 * pages are Astro files whose bodies are HTML written by hand, and the HTML
 * is turned into Markdown here — headings, paragraphs, code blocks, lists,
 * links and notes — rather than served as markup an AI would have to read
 * through tags. The site is the reference, so the server says what the site
 * says.
 *
 * Runs as part of `pnpm build` for the mcp package, and writes
 * `packages/mcp/docs/*.md` plus an `index.json` manifest.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'packages/mcp/docs')
const SITE_DOCS = join(ROOT, 'apps/site/src/pages/docs')

/** Repository Markdown, in reading order. */
const MARKDOWN = [
  [
    'readme',
    'README.md',
    'Matra README',
    'What Matra is, every package, the extension API, and how it compares.',
  ],
  [
    'engine',
    'ENGINE.md',
    'The Matra engine',
    'How the engine is built, what typing costs, and what changed in each release.',
  ],
  [
    'design',
    'DESIGN.md',
    'API design',
    'The principles behind the API and what differs from Tiptap.',
  ],
  [
    'benchmarks-full',
    'BENCHMARKS.md',
    'Benchmarks',
    'Bundle size and speed, measured, with the method and the caveats.',
  ],
  [
    'security',
    'SECURITY.md',
    'Security',
    'What is treated as hostile and where the rendering gate is.',
  ],
  ['changelog', 'CHANGELOG.md', 'Changelog', 'What changed in each version.'],
  [
    'contributing',
    'CONTRIBUTING.md',
    'Contributing',
    'How to set up, what gets merged, house rules.',
  ],
  ['releasing', 'RELEASING.md', 'Releasing', 'How a release is cut.'],
]

const ENTITIES = {
  '&#123;': '{',
  '&#125;': '}',
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
}

const decode = (text) =>
  text.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (entity) => {
    if (entity in ENTITIES) return ENTITIES[entity]
    if (entity.startsWith('&#x'))
      return String.fromCodePoint(Number.parseInt(entity.slice(3, -1), 16))
    if (entity.startsWith('&#')) return String.fromCodePoint(Number(entity.slice(2, -1)))
    return entity
  })

const absolute = (href) => (href.startsWith('/') ? `https://matrajs.com${href}` : href)

/**
 * HTML, as the docs pages write it, to Markdown.
 *
 * Code blocks come out first, verbatim, so nothing inside them is touched by
 * the rules below. Astro's `{expr}` interpolations that survive — a heading
 * rendered from data — are dropped, since there is no data here to render.
 */
function toMarkdown(html) {
  const blocks = []
  let text = html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (_, code) => {
    blocks.push(`\n\n\`\`\`\n${decode(code).replace(/\s+$/, '')}\n\`\`\`\n\n`)
    return `${blocks.length - 1}`
  })

  text = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_, t) => `\n\n## ${inline(t)}\n\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_, t) => `\n\n### ${inline(t)}\n\n`)
    .replace(/<div class="note">([\s\S]*?)<\/div>/g, (_, t) => `\n\n> Note: ${inline(t)}\n\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_, t) => `\n- ${inline(t)}`)
    .replace(/<(?:ul|ol)[^>]*>|<\/(?:ul|ol)>/g, '\n')
    .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/g, (_, row) => {
      const cells = [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((m) =>
        inline(m[1]),
      )
      return cells.length ? `\n| ${cells.join(' | ')} |` : ''
    })
    .replace(/<\/?(?:table|thead|tbody)[^>]*>/g, '\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (_, t) => `\n\n${inline(t)}\n\n`)
    .replace(/<[^>]+>/g, '')

  text = decode(text)
    .replace(/\{[^{}\n]*\}/g, '')
    .replace(/(\d+)/g, (_, i) => blocks[Number(i)])
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text

  function inline(fragment) {
    return decode(
      fragment
        .replace(/\s*\n\s*/g, ' ')
        .replace(
          /<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
          (_, href, t) => `[${strip(t)}](${absolute(href)})`,
        )
        .replace(/<code>([\s\S]*?)<\/code>/g, (_, t) => `\`${strip(t)}\``)
        .replace(/<(?:strong|b)>([\s\S]*?)<\/(?:strong|b)>/g, (_, t) => `**${strip(t)}**`)
        .replace(/<(?:em|i)>([\s\S]*?)<\/(?:em|i)>/g, (_, t) => `*${strip(t)}*`)
        .replace(/<br\s*\/?>/g, '\n')
        .replace(/<[^>]+>/g, ''),
    ).trim()
  }
  function strip(fragment) {
    return fragment.replace(/<[^>]+>/g, '')
  }
}

/** The props the page passes to its layout, read off the source. */
function prop(source, name) {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(source)
  return match ? decode(match[1]) : ''
}

async function main() {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  const manifest = []

  for (const [slug, file, title, description] of MARKDOWN) {
    let text
    try {
      text = await readFile(join(ROOT, file), 'utf8')
    } catch {
      continue
    }
    await writeFile(join(OUT, `${slug}.md`), text)
    manifest.push({ slug, title, description, source: file, file: `${slug}.md` })
  }

  const pages = (await readdir(SITE_DOCS)).filter((name) => name.endsWith('.astro')).sort()
  for (const name of pages) {
    const source = await readFile(join(SITE_DOCS, name), 'utf8')
    const body = /<Docs[\s\S]*?>([\s\S]*)<\/Docs>/.exec(source)?.[1]
    if (!body) continue
    const slug = name.replace(/\.astro$/, '')
    const title = prop(source, 'title').replace(/\s*·\s*Matra docs$/, '') || slug
    const description = prop(source, 'description')
    const heading = prop(source, 'heading') || title
    const text = `# ${heading}\n\n${description ? `${description}\n\n` : ''}${toMarkdown(body)}\n`
    const outFile = `docs-${slug}.md`
    await writeFile(join(OUT, outFile), text)
    manifest.push({
      slug: slug === 'index' ? 'docs' : slug,
      title,
      description,
      source: `https://matrajs.com/docs/${slug === 'index' ? '' : slug}`,
      file: outFile,
    })
  }

  await writeFile(join(OUT, 'index.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`docs-bundle: ${manifest.length} pages → ${OUT}`)
}

await main()
