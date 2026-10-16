import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHttpApp } from "../src/http-app.js";

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createHttpApp({ host: "127.0.0.1", port: 0, allowedHosts: undefined, allowedOrigins: undefined });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

/** Responses may come back as SSE; pull the JSON-RPC message out either way. */
async function rpcBody(res: Response) {
  const text = await res.text();
  const data = text.split("\n").find((l) => l.startsWith("data: "));
  return JSON.parse(data ? data.slice(6) : text);
}

describe("streamable HTTP transport", () => {
  it("serves health and metadata", async () => {
    expect(await (await fetch(`${base}/healthz`)).json()).toMatchObject({ ok: true });
    expect(await (await fetch(`${base}/`)).json()).toMatchObject({ name: "sparrow", mcp_endpoint: "/mcp" });
  });

  it("initializes statelessly and lists tools", async () => {
    const init = await rpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } },
    });
    expect(init.status).toBe(200);
    expect(init.headers.get("mcp-session-id")).toBeNull();
    expect((await rpcBody(init)).result.serverInfo.name).toBe("sparrow");

    const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { "mcp-protocol-version": "2025-06-18" });
    const names = (await rpcBody(list)).result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(expect.arrayContaining(["search_rooms", "get_listing_details", "list_cities"]));
  });

  it("answers CORS preflight for browser clients", async () => {
    const res = await fetch(`${base}/mcp`, {
      method: "OPTIONS",
      headers: { origin: "https://inspector.example", "access-control-request-method": "POST" },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-headers")).toMatch(/MCP-Protocol-Version/);
  });

  it("rejects GET and malformed JSON with JSON-RPC errors", async () => {
    const get = await fetch(`${base}/mcp`);
    expect(get.status).toBe(405);
    expect(((await get.json()) as any).error.message).toMatch(/stateless/);

    const bad = await rpc("{not json");
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error.code).toBe(-32700);
  });
});
