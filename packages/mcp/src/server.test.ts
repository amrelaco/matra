/**
 * The protocol half, driven without a transport.
 *
 * What a client does on connecting, in order: initialize, the initialized
 * notification, then tools and resources. Each step's shape is what the MCP
 * spec says it is, and a client that gets one of them wrong stops talking.
 */
import { describe, expect, it } from 'vitest'
import { type Doc, createServer, searchDocs } from './index'

const docs: Doc[] = [
  {
    slug: 'installation',
    title: 'Installation',
    description: 'Which packages exist.',
    source: 'apps/site/src/pages/docs/installation.astro',
    text: '# Installation\n\nnpm i @matrajs/react — installing a binding installs the engine.',
  },
  {
    slug: 'search',
    title: 'Search and replace',
    description: 'Find and replace, incrementally.',
    source: 'README.md',
    text: '# Search\n\neditor.commands.setSearch({ query })\nnextMatch, replaceMatch, replaceAllMatches.',
  },
]

const server = createServer(docs, { name: 'test', version: '1.2.3' })

const call = (method: string, params?: Record<string, unknown>, id: number | string = 1) =>
  server.handle({ jsonrpc: '2.0', id, method, params })

describe('the handshake', () => {
  it('agrees a protocol version it knows and describes itself', () => {
    const reply = call('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'x', version: '0' },
    })
    expect(reply?.error).toBeUndefined()
    const result = reply?.result as { protocolVersion: string; serverInfo: { version: string } }
    expect(result.protocolVersion).toBe('2025-03-26')
    expect(result.serverInfo.version).toBe('1.2.3')
  })

  it('offers its newest version to a client asking for one it does not know', () => {
    const result = call('initialize', { protocolVersion: '2099-01-01' })?.result as {
      protocolVersion: string
    }
    expect(result.protocolVersion).toBe('2025-06-18')
  })

  it('says nothing back to a notification', () => {
    expect(server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })

  it('answers a ping', () => {
    expect(call('ping')?.result).toEqual({})
  })
})

describe('tools', () => {
  it('lists three read-only tools', () => {
    const result = call('tools/list')?.result as { tools: { name: string }[] }
    expect(result.tools.map((tool) => tool.name)).toEqual([
      'list_docs',
      'read_doc',
      'search_docs',
    ])
  })

  it('lists, reads and searches', () => {
    const list = call('tools/call', { name: 'list_docs', arguments: {} })?.result as {
      content: { text: string }[]
    }
    expect(list.content[0]?.text).toContain('installation — Installation')

    const read = call('tools/call', { name: 'read_doc', arguments: { slug: 'search' } })
      ?.result as { content: { text: string }[] }
    expect(read.content[0]?.text).toContain('replaceAllMatches')

    const found = call('tools/call', { name: 'search_docs', arguments: { query: 'binding' } })
      ?.result as { content: { text: string }[] }
    expect(found.content[0]?.text).toContain('slug: installation')
    expect(found.content[0]?.text).not.toContain('slug: search')
  })

  it('reports a missing page as a tool error, not a protocol error', () => {
    const reply = call('tools/call', { name: 'read_doc', arguments: { slug: 'nope' } })
    expect(reply?.error).toBeUndefined()
    expect((reply?.result as { isError: boolean }).isError).toBe(true)
  })

  it('refuses bad arguments and unknown tools with the right codes', () => {
    expect(call('tools/call', { name: 'read_doc', arguments: {} })?.error?.code).toBe(-32602)
    expect(call('tools/call', { name: 'delete_everything' })?.error?.code).toBe(-32602)
    expect(call('nothing/here')?.error?.code).toBe(-32601)
  })
})

describe('resources', () => {
  it('lists every page as a matra:// resource and reads one back', () => {
    const list = call('resources/list')?.result as { resources: { uri: string }[] }
    expect(list.resources.map((r) => r.uri)).toEqual([
      'matra://docs/installation',
      'matra://docs/search',
    ])
    const read = call('resources/read', { uri: 'matra://docs/search' })?.result as {
      contents: { text: string; mimeType: string }[]
    }
    expect(read.contents[0]?.mimeType).toBe('text/markdown')
    expect(read.contents[0]?.text).toContain('setSearch')
    expect(call('resources/read', { uri: 'https://example.com' })?.error?.code).toBe(-32602)
  })
})

describe('off the wire', () => {
  it('handles a batch, drops notifications from it, and reports a parse error', () => {
    const batch = server.handleRaw(
      JSON.stringify([
        { jsonrpc: '2.0', id: 'a', method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
      ]),
    )
    expect(Array.isArray(batch) && batch.length).toBe(1)
    const broken = server.handleRaw('{not json') as { error: { code: number } }
    expect(broken.error.code).toBe(-32700)
    const wrong = server.handle({ hello: 'world' }) as { error: { code: number } }
    expect(wrong.error.code).toBe(-32600)
  })
})

describe('search ranking', () => {
  it('needs every term, weighs the title, and gives a snippet', () => {
    expect(searchDocs(docs, 'replace')).toHaveLength(1)
    expect(searchDocs(docs, 'replace binding')).toHaveLength(0)
    expect(searchDocs(docs, 'search')[0]?.doc.slug).toBe('search')
    expect(searchDocs(docs, 'engine')[0]?.snippet).toContain('engine')
    expect(searchDocs(docs, '')).toHaveLength(0)
  })
})
