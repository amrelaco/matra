import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { APIRoute } from 'astro'

/**
 * The whole documentation, in one fetch.
 *
 * `llms.txt` is a map: what this is and where the pages are. This is the
 * territory — every page of the documentation concatenated as plain Markdown,
 * which is the form an answer engine can actually read. Twenty round trips
 * through a JavaScript-rendered site is a budget most crawlers will not spend,
 * and the ones that do get HTML they have to strip tags out of first.
 *
 * The text is not written twice. `scripts/docs-bundle.mjs` already turns the
 * site's docs pages into Markdown for the MCP server — the same conversion,
 * the same source, so the site cannot say one thing and the server another.
 * Vercel builds the packages before the site (`vercel.json`), so the directory
 * is there; when it is not, this degrades to a pointer rather than failing the
 * build, because a missing nice-to-have must not stop a deploy.
 */
const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = resolve(HERE, '../../../../packages/mcp/docs')

interface Entry {
  slug: string
  title: string
  description: string
  source: string
  file: string
}

const MISSING = `# Matra

The full documentation bundle was not built for this deployment. Read the
short form at https://matrajs.com/llms.txt and the pages at
https://matrajs.com/docs.
`

function bundle(): string {
  if (!existsSync(join(DOCS, 'index.json'))) {
    console.warn('llms-full: packages/mcp/docs is missing · run `pnpm build` first')
    return MISSING
  }

  const manifest = JSON.parse(readFileSync(join(DOCS, 'index.json'), 'utf8')) as Entry[]
  const known = new Set(readdirSync(DOCS))

  const parts = [
    '# Matra — full documentation',
    '',
    '> A headless rich text editor framework for the web, with a first-class',
    '> extension model. Every page of the documentation follows, in reading',
    '> order. Source: https://matrajs.com',
    '',
    '---',
    '',
  ]

  for (const entry of manifest) {
    if (!known.has(entry.file)) continue
    const text = readFileSync(join(DOCS, entry.file), 'utf8').trim()
    /*
      The source line matters: it is the URL an answer engine should cite, and
      without it every page in here looks like it came from the same place.
      Repository files arrive as a bare filename, so they are pointed at the
      repository rather than left as a path that resolves nowhere.
    */
    const source = entry.source.startsWith('http')
      ? entry.source
      : `https://github.com/amrelaco/matra/blob/main/${entry.source}`
    parts.push(`<!-- source: ${source} -->`, '', text, '', '---', '')
  }

  return `${parts.join('\n')}\n`
}

/*
  Built once. An endpoint runs per request in a server build and once in a
  static one, and reading thirty files off disk for each of thirty pages would
  be thirty times the work for the same bytes.
*/
const TEXT = bundle()

export const GET: APIRoute = () =>
  new Response(TEXT, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
