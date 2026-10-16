#!/usr/bin/env node
/**
 * stdio entry point: used by Claude Desktop, Claude Code, Cursor and other local MCP clients.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { log } from "./common/log.js";
import { createServer, SERVER_VERSION } from "./server.js";

const server = createServer();
await server.connect(new StdioServerTransport());
// Never write to stdout here: it is the MCP channel. log writes to stderr.
log.info("ready on stdio", { version: SERVER_VERSION });
