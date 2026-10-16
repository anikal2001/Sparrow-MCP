# Sparrow MCP

An [MCP](https://modelcontextprotocol.io) server that lets Claude, ChatGPT and other MCP clients search rooms on [sparrowshare.com](https://sparrowshare.com) from plain English.

> "Find me a private room in Toronto under $900 a month, moving in December, that allows cats."

The model turns that into a `search_rooms` call, Sparrow's public search API answers, and the user gets back listings with prices, availability, house rules and links.

## Tools

| Tool | What it does |
| --- | --- |
| `search_rooms` | Search by city, neighbourhood, intersection, address or postal code, with filters for price, move-in date, lease length, gender, bedroom privacy, guests, pets and listing type. Returns compact results, the total match count and a cursor for the next page. |
| `get_listing_details` | Full details of one listing: description, amenities, utilities, house rules, host, every room with price and availability, photos and the public URL. |
| `list_cities` | The cities Sparrow currently has rooms in. |

Every tool is read-only and declares an `outputSchema`, so clients get typed `structuredContent` alongside the JSON text.

## Prompts

| Prompt | What it does |
| --- | --- |
| `find_a_room` | Takes a city plus optional budget, move-in date and other needs, and asks the model to search and present the best five matches. Shows up in client prompt menus (e.g. `/` in Claude Desktop). |

Places are geocoded with OpenStreetMap Nominatim (free, no key). Cities use their own boundary; addresses and intersections use a radius (3 km by default, or `radius_km`).

No login is needed. The server only calls Sparrow's unauthenticated search, count, city and listing-detail endpoints.

## Setup

Requires Node 18 or newer.

```bash
npm install
npm run build
```

### Claude Desktop

Add to `claude_desktop_config.json` (Settings, Developer, Edit Config). Use the absolute path to this folder:

```json
{
  "mcpServers": {
    "sparrow": {
      "command": "node",
      "args": ["C:\\Users\\anika\\Documents\\Github\\Sparrow-MCP\\dist\\stdio.js"]
    }
  }
}
```

Restart Claude Desktop. The three tools appear under the tools menu.

### Claude Code

This repo ships a `.mcp.json`, so the server is available automatically when you open the folder. From anywhere else:

```bash
claude mcp add sparrow -- node C:\Users\anika\Documents\Github\Sparrow-MCP\dist\stdio.js
```

### ChatGPT and other remote clients

ChatGPT connectors need a public HTTPS URL, so run the HTTP transport and expose it:

```bash
npm run start:http          # listens on http://127.0.0.1:3000/mcp
```

For a quick test, tunnel it with something like `ngrok http 3000`, then in ChatGPT go to Settings, Connectors, Create, and enter `https://<your-tunnel>/mcp` with no authentication.

For a real deployment, bind to all interfaces and restrict the Host header:

```bash
HOST=0.0.0.0 PORT=3000 ALLOWED_HOSTS=sparrow-mcp.example.com npm run start:http
```

The HTTP server is stateless, so it can run behind any load balancer. `GET /healthz` returns `{"ok":true}`.

## Configuration

All optional, via environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SPARROW_BASE_URL` | `https://sparrowshare.com` | Sparrow origin |
| `SPARROW_TIMEOUT_MS` | `20000` | Per-request timeout to Sparrow |
| `SPARROW_GEOCODE_COUNTRIES` | `ca` | Comma-separated country codes to bias geocoding. Empty string disables the bias. |
| `SPARROW_GEOCODER_USER_AGENT` | `sparrow-mcp/0.1 (...)` | Nominatim requires an identifying user agent. Set your own if you deploy publicly. |
| `SPARROW_GEOCODE_CACHE_SIZE` | `500` | Geocoding results kept in memory (LRU) |
| `SPARROW_GEOCODE_MIN_GAP_MS` | `1100` | Gap between geocoder calls. Public Nominatim allows 1 req/s; lower only for a self-hosted geocoder. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn` or `error`. Logs are JSON lines on stderr. |
| `HOST`, `PORT`, `ALLOWED_HOSTS` | `127.0.0.1`, `3000`, unset | HTTP transport only |
| `ALLOWED_ORIGINS` | unset (any) | HTTP only: comma-separated browser origins allowed by CORS |

## Development

```bash
npm run dev        # tsc --watch
npm test           # offline unit + transport tests (vitest, mocked fetch, no network)
npm run typecheck  # src and tests
npm run test:live  # builds, then runs scripts/smoke.mjs against the live Sparrow API
```

`npm test` drives the real server through an in-memory MCP client and a stubbed `fetch`, and mounts the HTTP app on an ephemeral port. `test:live` starts the stdio server the way a real client does and checks every tool against sparrowshare.com.

### Layout

```
src/config.ts                 every environment variable, parsed once
src/common/registration.ts    the only way tools reach the McpServer: formats results, maps errors, logs timing
src/common/errors.ts          McpToolError: a model-safe message plus an internal one for logs
src/common/http-client.ts     the one outbound fetch: User-Agent, timeout, JSON, upstream error mapping
src/common/fmt.ts, log.ts     description formatting, JSON logs to stderr
src/api/sparrow.api.ts        Sparrow endpoints and raw response shapes
src/api/geocode.api.ts        Nominatim geocoder with LRU cache and 1 req/s throttle
src/types/sparrow.types.ts    tool names, enum values, zod input and output schemas
src/format.ts                 raw Sparrow shapes to the compact shapes the model sees
src/tools/*.tools.ts          registerXTools(ctx): one module per tool group
src/prompts/*.prompts.ts      registerPrompts(ctx)
src/server.ts                 createServer(): wires tools and prompts onto a fresh McpServer
src/stdio.ts                  local entry point (Claude Desktop, Claude Code)
src/http-app.ts, http.ts      Streamable HTTP app factory and entry point (ChatGPT, claude.ai connectors)
```

To add a tool: put its zod schemas in `src/types`, write `registerFooTools(ctx)` in `src/tools/foo.tools.ts` returning plain data (throw `badInput(...)` for caller mistakes), and call it from `createServer`.

## Notes on the Sparrow API

- Search takes a map bounding box, not a city name, which is why the server geocodes.
- `perPage` caps at 200. Paging is cursor based.
- Unknown filter values are silently ignored by Sparrow, so the tool schema restricts gender, privacy, pets and listing type to the values the site itself uses.
- Listing types seen in the wild: `HOMESHARE` (room in a host's home), `COLIVING`, `ENTIRE_UNIT`.
- Featured rooms are pinned to the top of every page. The server drops them from pages after the first so they are not repeated.
- The paging cursor only encodes the last price, so rooms sharing a price across a page boundary can be skipped. Larger `limit` values make this less likely.
