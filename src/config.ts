/**
 * Every environment variable the server reads, parsed in one place.
 * Modules import `config` instead of touching process.env themselves.
 */
import { PACKAGE_NAME, VERSION } from "./version.js";

const REPO_URL = "https://github.com/anikal2001/Sparrow-MCP";

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
  return n;
}

function list(raw: string | undefined): string[] | undefined {
  const items = raw?.split(",").map((s) => s.trim()).filter(Boolean);
  return items?.length ? items : undefined;
}

export const config = {
  server: { name: "sparrow", version: VERSION },
  userAgent: process.env.SPARROW_USER_AGENT ?? `${PACKAGE_NAME}/${VERSION} (+${REPO_URL})`,
  sparrow: {
    baseUrl: (process.env.SPARROW_BASE_URL ?? "https://sparrowshare.com").replace(/\/$/, ""),
    timeoutMs: num("SPARROW_TIMEOUT_MS", 20000),
  },
  geocoder: {
    url: process.env.SPARROW_GEOCODER_URL ?? "https://nominatim.openstreetmap.org/search",
    /** Nominatim requires an identifying User-Agent; defaults to the server's own. */
    userAgent: process.env.SPARROW_GEOCODER_USER_AGENT,
    /** Sparrow only lists Canadian rooms, so bias to Canada. Empty string disables the bias. */
    countryCodes: process.env.SPARROW_GEOCODE_COUNTRIES ?? "ca",
    defaultRadiusKm: 3,
    /** Public Nominatim allows 1 req/s; lower only for a self-hosted geocoder. */
    minGapMs: num("SPARROW_GEOCODE_MIN_GAP_MS", 1100),
    cacheSize: num("SPARROW_GEOCODE_CACHE_SIZE", 500),
  },
  http: {
    host: process.env.HOST ?? "127.0.0.1",
    port: num("PORT", 3000),
    allowedHosts: list(process.env.ALLOWED_HOSTS),
    /** Origins allowed to call /mcp from a browser. Unset allows any origin. */
    allowedOrigins: list(process.env.ALLOWED_ORIGINS),
  },
  logLevel: (process.env.LOG_LEVEL ?? "info") as "debug" | "info" | "warn" | "error",
} as const;
