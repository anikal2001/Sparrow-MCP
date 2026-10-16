/**
 * Structured logs to stderr. Never stdout: on the stdio transport that is the MCP channel.
 */
import { config } from "../config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[config.logLevel]) return;
  console.error(JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields }));
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};
