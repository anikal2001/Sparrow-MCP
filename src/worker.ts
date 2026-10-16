/**
 * Cloudflare Workers entry point. Same server and tools as src/http.ts, on the SDK's
 * web-standard transport instead of Express. Stateless: a fresh server per request.
 *
 * Config comes from wrangler vars/secrets, exposed as process.env by the nodejs_compat flag.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { config } from "./config.js";
import { log } from "./common/log.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const MAX_BODY_BYTES = 1024 * 1024;
const CORS_HEADERS = "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID";

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = config.http.allowedOrigins;
  if (!origin || (allowed && !allowed.includes(origin))) return {};
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "*",
    Vary: "Origin",
    "Access-Control-Allow-Headers": CORS_HEADERS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };
}

function withHeaders(res: Response, headers: Record<string, string>): Response {
  if (!Object.keys(headers).length) return res;
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) out.headers.set(k, v);
  return out;
}

const jsonRpcError = (status: number, code: number, message: string) =>
  Response.json({ jsonrpc: "2.0", error: { code, message }, id: null }, { status });

async function handleMcp(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return jsonRpcError(405, -32000, "Method not allowed. This server is stateless: send JSON-RPC with POST /mcp.");
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonRpcError(413, -32000, "Request body too large.");
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(400, -32700, "Parse error: body is not valid JSON.");
  }

  const server = createServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    // Plain JSON replies: nothing here streams, and it avoids holding an SSE stream open.
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request, { parsedBody: body });
  } catch (err) {
    log.error("mcp request failed", { message: (err as Error).message });
    return jsonRpcError(500, -32603, "Internal server error");
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("origin"));

    if (request.method === "OPTIONS") {
      const denied = request.headers.get("origin") && !Object.keys(cors).length;
      return new Response(null, { status: denied ? 403 : 204, headers: cors });
    }

    let res: Response;
    if (url.pathname === "/mcp") res = await handleMcp(request);
    else if (url.pathname === "/healthz") res = Response.json({ ok: true, version: SERVER_VERSION });
    else if (url.pathname === "/") res = Response.json({ name: SERVER_NAME, version: SERVER_VERSION, mcp_endpoint: "/mcp" });
    else res = Response.json({ error: "Not found" }, { status: 404 });

    return withHeaders(res, cors);
  },
};
