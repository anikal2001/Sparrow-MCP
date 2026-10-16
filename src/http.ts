/**
 * Streamable HTTP entry point: used by remote clients such as ChatGPT connectors,
 * claude.ai custom connectors, or anything that needs a URL instead of a local process.
 */
import { config } from "./config.js";
import { log } from "./common/log.js";
import { createHttpApp } from "./http-app.js";
import { SERVER_VERSION } from "./server.js";

const { host, port } = config.http;
createHttpApp().listen(port, host, () => {
  log.info("listening", { url: `http://${host}:${port}/mcp`, version: SERVER_VERSION });
});
