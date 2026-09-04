#!/usr/bin/env node
/// <reference types="node" />
/**
 * `matra-mcp` — the Matra documentation as an MCP server.
 *
 *   matra-mcp                 stdio, which is what a desktop client spawns
 *   matra-mcp --http 3333     Streamable HTTP on http://localhost:3333/mcp
 *   matra-mcp --docs ./dir    serve another directory of pages
 *
 * Both transports feed the same `createServer`. Stdio is newline-delimited
 * JSON on stdin and stdout, with everything human going to stderr so it never
 * lands in the protocol stream. HTTP is one POST per message, answered with
 * JSON — the simplest legal shape of the streamable transport, and enough for
 * a documentation server with nothing to push.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { type Doc, createServer } from './index'

const here = fileURLToPath(new URL('.', import.meta.url))
const packageJson = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version: string
}

/** Read the pages the build wrote. */
export function loadDocs(dir: string): Doc[] {
  const manifest = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as Array<
    Omit<Doc, 'text'> & { file: string }
  >
  const files = new Set(readdirSync(dir))
  return manifest
    .filter((entry) => files.has(entry.file))
    .map(({ file, ...entry }) => ({ ...entry, text: readFileSync(`${dir}/${file}`, 'utf8') }))
}

function parseArgs(argv: string[]): { http: number | null; docs: string } {
  let http: number | null = null
  let docs = `${here}../docs`
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--http') {
      const port = Number(argv[i + 1])
      http = Number.isInteger(port) && port > 0 ? port : 3333
      if (Number.isInteger(port)) i++
    } else if (arg === '--docs') {
      docs = argv[++i] ?? docs
    } else if (arg === '--help' || arg === '-h') {
      process.stderr.write(
        'matra-mcp [--http [port]] [--docs <dir>]\n\nThe Matra documentation as an MCP server. Stdio by default.\n',
      )
      process.exit(0)
    } else if (arg === '--version' || arg === '-v') {
      process.stdout.write(`${packageJson.version}\n`)
      process.exit(0)
    }
  }
  return { http, docs }
}

function main(): void {
  const { http, docs: dir } = parseArgs(process.argv.slice(2))
  let docs: Doc[]
  try {
    docs = loadDocs(dir)
  } catch (error) {
    process.stderr.write(
      `matra-mcp: cannot read the documentation in ${dir}: ${String(error)}\n`,
    )
    process.exit(1)
  }
  const server = createServer(docs, { version: packageJson.version })

  if (http !== null) {
    serveHttp(server, http)
    return
  }
  serveStdio(server)
}

function serveStdio(server: ReturnType<typeof createServer>): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
  lines.on('line', (line) => {
    if (!line.trim()) return
    const reply = server.handleRaw(line)
    if (reply) process.stdout.write(`${JSON.stringify(reply)}\n`)
  })
  lines.on('close', () => process.exit(0))
  process.stderr.write(`matra-mcp: ${server.docs.length} pages, stdio\n`)
}

function serveHttp(server: ReturnType<typeof createServer>, port: number): void {
  const http = createHttpServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers':
        'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version',
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, headers)
      response.end()
      return
    }
    if (url.pathname !== '/mcp') {
      response.writeHead(404, headers)
      response.end(JSON.stringify({ error: 'POST JSON-RPC to /mcp' }))
      return
    }
    if (request.method === 'DELETE') {
      response.writeHead(200, headers)
      response.end()
      return
    }
    if (request.method !== 'POST') {
      // No server-initiated messages, so there is no stream to open.
      response.writeHead(405, { ...headers, Allow: 'POST' })
      response.end()
      return
    }
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 1_000_000) request.destroy()
    })
    request.on('end', () => {
      const reply = server.handleRaw(body)
      if (!reply) {
        response.writeHead(202, headers)
        response.end()
        return
      }
      response.writeHead(200, headers)
      response.end(JSON.stringify(reply))
    })
  })
  http.listen(port, () => {
    process.stderr.write(
      `matra-mcp: ${server.docs.length} pages at http://localhost:${port}/mcp\n`,
    )
  })
}

main()
