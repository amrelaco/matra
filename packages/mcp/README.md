# @matrajs/mcp

The Matra documentation as a [Model Context Protocol](https://modelcontextprotocol.io)
server, so any AI tool can read it. Zero dependencies, like every other
Matra package.

```sh
npx -y @matrajs/mcp            # stdio · what a desktop client spawns
npx -y @matrajs/mcp --http     # http://localhost:3333/mcp
```

## Connect it, step by step

**Claude Code**

```sh
claude mcp add matra -- npx -y @matrajs/mcp
```

**Claude Desktop** — in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "matra": { "command": "npx", "args": ["-y", "@matrajs/mcp"] }
  }
}
```

**Cursor** — in `.cursor/mcp.json`, the same object under `"mcpServers"`.

**Codex** — in `~/.codex/config.toml`:

```toml
[mcp_servers.matra]
command = "npx"
args = ["-y", "@matrajs/mcp"]
```

**Anything that speaks HTTP** — run `npx -y @matrajs/mcp --http 3333` and
point the client at `http://localhost:3333/mcp`.

Then ask the tool something about Matra. It will call `search_docs`, read
the page it needs, and answer from the documentation rather than from
memory.

## What it serves

| Tool | Does |
|---|---|
| `list_docs` | Every page, with its slug and a one-line description. |
| `read_doc { slug }` | One page, as Markdown. |
| `search_docs { query, limit? }` | Ranked pages with a snippet each. |

Every page is also a resource at `matra://docs/<slug>`.

The pages are the repository's Markdown — README, the engine notes,
benchmarks, security, the changelog — and every page of
[matrajs.com/docs](https://matrajs.com/docs), converted to Markdown at build
time and shipped inside the package. Nothing is fetched at runtime.

## Use it from code

```ts
import { createServer } from '@matrajs/mcp'

const server = createServer(docs)
server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
```

`createServer` is the protocol without a transport: one message in, one
reply out. Put it behind whatever transport you already have.
