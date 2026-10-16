/**
 * Express app for the Streamable HTTP transport. Built by a factory so tests can mount it
 * without opening a port; src/http.ts is the entry point that listens.
 *
 * Stateless: a fresh server + transport per request, so it scales horizontally and
 * needs no session storage.
 */
import type { Express, NextFunction, Request, Response } from "express";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { config } from "./config.js";
import { log } from "./common/log.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const CORS_HEADERS = "Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID";

/** Lets browser-based clients (MCP Inspector, web playgrounds) call /mcp. */
function cors(allowedOrigins: readonly string[] | undefined) {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (!allowedOrigins || allowedOrigins.includes(origin))) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigins ? origin : "*");
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS);
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Expose-Headers", "MCP-Protocol-Version, Mcp-Session-Id");
      res.setHeader("Access-Control-Max-Age", "86400");
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(origin && allowedOrigins && !allowedOrigins.includes(origin) ? 403 : 204);
      return;
    }
    next();
  };
}

function jsonRpcError(res: Response, status: number, code: number, message: string) {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

export function createHttpApp(opts: typeof config.http = config.http): Express {
  const app = createMcpExpressApp({ host: opts.host, allowedHosts: opts.allowedHosts });
  app.use(cors(opts.allowedOrigins));

  app.get("/", (_req, res) => {
    res.json({ name: SERVER_NAME, version: SERVER_VERSION, mcp_endpoint: "/mcp" });
  });
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, version: SERVER_VERSION });
  });

  app.post("/mcp", async (req, res) => {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error("mcp request failed", { message: (err as Error).message });
      if (!res.headersSent) jsonRpcError(res, 500, -32603, "Internal server error");
    }
  });

  // Stateless server: no SSE stream to resume and no session to delete.
  const methodNotAllowed = (_req: Request, res: Response) =>
    jsonRpcError(res, 405, -32000, "Method not allowed. This server is stateless: send JSON-RPC with POST /mcp.");
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  // Body parser failures (oversized or malformed JSON) as JSON-RPC errors, not HTML.
  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next(err);
    if (err.type === "entity.too.large") return jsonRpcError(res, 413, -32000, "Request body too large.");
    if (err.type === "entity.parse.failed") return jsonRpcError(res, 400, -32700, "Parse error: body is not valid JSON.");
    log.error("http error", { message: err.message });
    jsonRpcError(res, err.status ?? 500, -32603, "Internal server error");
  });

  return app;
}
