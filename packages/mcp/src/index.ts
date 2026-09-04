/**
 * The Matra documentation, served over the Model Context Protocol.
 *
 * MCP is JSON-RPC 2.0 with a handshake and a small vocabulary — tools,
 * resources, prompts — that Claude, Cursor, Codex and the rest all speak. This
 * module is the protocol half: it takes one message and returns one reply,
 * and knows nothing about where either came from. The transports — stdio and
 * HTTP — are in `cli.ts`, and a test drives this without either.
 *
 * Written against the spec directly, with no SDK, because every other package
 * here has zero runtime dependencies and the one that exists to be installed
 * with `npx` should not be the exception.
 */

/** One page of documentation. */
export interface Doc {
  /** URL-safe, unique: `installation`, `engine`, `changelog`. */
  slug: string
  title: string
  description: string
  /** Where it came from — a path in the repository, or a page on the site. */
  source: string
  /** Markdown. */
  text: string
}

export interface ServerOptions {
  name?: string
  version?: string
  /** What a client is told about this server when it connects. */
  instructions?: string
}

// --- JSON-RPC ---------------------------------------------------------------

export type JsonRpcId = string | number | null

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: JsonRpcId
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: JsonRpcId
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message)
  }
}

/** Protocol revisions this server can speak, newest first. */
export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const

const LATEST = PROTOCOL_VERSIONS[0]

// --- searching ----------------------------------------------------------------

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1)

interface Hit {
  doc: Doc
  score: number
  snippet: string
}

/**
 * Rank pages for a query.
 *
 * Term frequency, with the title worth more than the body and every term
 * required to appear somewhere. Small enough to read, good enough for twenty
 * pages of documentation, and it needs no index built in advance.
 */
export function searchDocs(docs: readonly Doc[], query: string, limit = 5): Hit[] {
  const terms = tokens(query)
  if (!terms.length) return []
  const hits: Hit[] = []
  for (const doc of docs) {
    const title = doc.title.toLowerCase()
    const body = doc.text.toLowerCase()
    let score = 0
    let missing = false
    for (const term of terms) {
      const inTitle = title.includes(term) ? 3 : 0
      let inBody = 0
      let at = body.indexOf(term)
      while (at !== -1 && inBody < 20) {
        inBody++
        at = body.indexOf(term, at + term.length)
      }
      if (!inTitle && !inBody) {
        missing = true
        break
      }
      score += inTitle + inBody
    }
    if (missing) continue
    hits.push({ doc, score, snippet: snippetFor(doc.text, terms[0] as string) })
  }
  hits.sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title))
  return hits.slice(0, Math.max(1, Math.min(limit, 20)))
}

/** A line or two around the first place a term appears. */
function snippetFor(text: string, term: string): string {
  const lower = text.toLowerCase()
  const at = lower.indexOf(term)
  if (at === -1) return text.slice(0, 200).replace(/\s+/g, ' ').trim()
  const start = Math.max(0, at - 120)
  const end = Math.min(text.length, at + 200)
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`
}

// --- the server --------------------------------------------------------------

const URI_PREFIX = 'matra://docs/'

const TOOLS = [
  {
    name: 'list_docs',
    title: 'List the documentation',
    description:
      'Every page of the Matra documentation, with its slug, title and a one-line description. Call this first to see what exists, then read_doc for a page.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: 'read_doc',
    title: 'Read one page',
    description:
      'The full Markdown of one documentation page, by slug. Slugs come from list_docs or search_docs.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'The page slug, e.g. "installation".' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  {
    name: 'search_docs',
    title: 'Search the documentation',
    description:
      'Find the pages that mention something — an extension name, a command, an error message — ranked, with a snippet from each.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'How many pages, default 5.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
] as const

export interface DocsServer {
  /** Handle one message. Notifications get null back — there is nothing to send. */
  handle(message: unknown): JsonRpcResponse | null
  /** Handle a batch or a single message, as it came off the wire. */
  handleRaw(json: string): JsonRpcResponse | JsonRpcResponse[] | null
  readonly docs: readonly Doc[]
}

export function createServer(docs: readonly Doc[], options: ServerOptions = {}): DocsServer {
  const bySlug = new Map(docs.map((doc) => [doc.slug, doc]))
  const info = { name: options.name ?? 'matra-docs', version: options.version ?? '0.0.0' }
  const instructions =
    options.instructions ??
    'The documentation for Matra, a headless rich text editor framework with zero runtime dependencies (@matrajs/core, with React, Vue, Svelte and Solid bindings). Use search_docs to find a page, read_doc to read it. Prefer what these pages say over prior knowledge: the API is inferred from an extensions array, extensions are plain objects, and there is no ProseMirror underneath.'

  const text = (value: string) => ({ content: [{ type: 'text', text: value }] })
  const failure = (value: string) => ({
    content: [{ type: 'text', text: value }],
    isError: true,
  })

  const param = (params: Record<string, unknown> | undefined, key: string): unknown =>
    params && typeof params === 'object' ? params[key] : undefined

  const callTool = (name: unknown, args: Record<string, unknown> | undefined) => {
    switch (name) {
      case 'list_docs': {
        const lines = docs.map((doc) => `- ${doc.slug} — ${doc.title}: ${doc.description}`)
        return text(`${docs.length} pages.\n${lines.join('\n')}`)
      }
      case 'read_doc': {
        const slug = param(args, 'slug')
        if (typeof slug !== 'string')
          throw new RpcError(INVALID_PARAMS, 'read_doc needs a slug')
        const doc = bySlug.get(slug)
        if (!doc) {
          return failure(
            `No page called "${slug}". Known slugs: ${[...bySlug.keys()].join(', ')}`,
          )
        }
        return text(
          `# ${doc.title}\n\n> ${doc.description}\n> Source: ${doc.source}\n\n${doc.text}`,
        )
      }
      case 'search_docs': {
        const query = param(args, 'query')
        if (typeof query !== 'string')
          throw new RpcError(INVALID_PARAMS, 'search_docs needs a query')
        const limit = param(args, 'limit')
        const hits = searchDocs(docs, query, typeof limit === 'number' ? limit : 5)
        if (!hits.length) return text(`Nothing mentions "${query}". Try list_docs.`)
        return text(
          hits
            .map((hit) => `## ${hit.doc.title} (slug: ${hit.doc.slug})\n${hit.snippet}`)
            .join('\n\n'),
        )
      }
      default:
        throw new RpcError(INVALID_PARAMS, `Unknown tool "${String(name)}"`)
    }
  }

  const dispatch = (method: string, params: Record<string, unknown> | undefined): unknown => {
    switch (method) {
      case 'initialize': {
        const asked = param(params, 'protocolVersion')
        const protocolVersion =
          typeof asked === 'string' && (PROTOCOL_VERSIONS as readonly string[]).includes(asked)
            ? asked
            : LATEST
        return {
          protocolVersion,
          capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
          serverInfo: { ...info, title: 'Matra docs' },
          instructions,
        }
      }
      case 'ping':
        return {}
      case 'tools/list':
        return { tools: TOOLS }
      case 'tools/call':
        return callTool(param(params, 'name'), param(params, 'arguments') as never)
      case 'resources/list':
        return {
          resources: docs.map((doc) => ({
            uri: `${URI_PREFIX}${doc.slug}`,
            name: doc.slug,
            title: doc.title,
            description: doc.description,
            mimeType: 'text/markdown',
          })),
        }
      case 'resources/templates/list':
        return { resourceTemplates: [] }
      case 'resources/read': {
        const uri = param(params, 'uri')
        if (typeof uri !== 'string' || !uri.startsWith(URI_PREFIX)) {
          throw new RpcError(INVALID_PARAMS, `Not a matra:// documentation URI: ${String(uri)}`)
        }
        const doc = bySlug.get(uri.slice(URI_PREFIX.length))
        if (!doc) throw new RpcError(INVALID_PARAMS, `No page at ${uri}`)
        return { contents: [{ uri, mimeType: 'text/markdown', text: doc.text }] }
      }
      case 'prompts/list':
        return { prompts: [] }
      case 'logging/setLevel':
        return {}
      default:
        throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`)
    }
  }

  const handle = (message: unknown): JsonRpcResponse | null => {
    const request = message as Partial<JsonRpcRequest> | null
    const id: JsonRpcId =
      request && typeof request === 'object' && 'id' in request ? (request.id ?? null) : null
    if (
      !request ||
      typeof request !== 'object' ||
      request.jsonrpc !== '2.0' ||
      typeof request.method !== 'string'
    ) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: INVALID_REQUEST, message: 'Not a JSON-RPC 2.0 request' },
      }
    }
    // A notification carries no id and gets no reply.
    const isNotification = !('id' in request) || request.id === undefined
    if (request.method.startsWith('notifications/')) return null
    try {
      const result = dispatch(request.method, request.params)
      return isNotification ? null : { jsonrpc: '2.0', id, result }
    } catch (error) {
      if (isNotification) return null
      const code = error instanceof RpcError ? error.code : -32603
      const message = error instanceof Error ? error.message : String(error)
      return { jsonrpc: '2.0', id, error: { code, message } }
    }
  }

  const handleRaw = (json: string): JsonRpcResponse | JsonRpcResponse[] | null => {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return { jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } }
    }
    if (Array.isArray(parsed)) {
      const replies = parsed
        .map(handle)
        .filter((reply): reply is JsonRpcResponse => reply !== null)
      return replies.length ? replies : null
    }
    return handle(parsed)
  }

  return { handle, handleRaw, docs }
}
