/**
 * Structured logs to stderr. Never stdout: on the stdio transport that is the MCP channel.
 */
import { config } from "../config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

/** Workers has no MCP-on-stdout concern, and its log viewer keys severity off the console method. */
const ON_WORKERS = globalThis.navigator?.userAgent === "Cloudflare-Workers";

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[config.logLevel]) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (ON_WORKERS) console[level === "debug" ? "debug" : level === "info" ? "log" : level](line);
  else console.error(line);
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
