/**
 * The one outbound fetch: sets our User-Agent, enforces a timeout, parses JSON and maps
 * failures to McpToolError so every upstream call fails the same way.
 */
import { config } from "../config.js";
import { log } from "./log.js";
import { McpToolError, upstreamError } from "./errors.js";

export interface FetchJsonOptions {
  /** Name used in error messages, e.g. "Sparrow". */
  service: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  userAgent?: string;
  /** Pulls a human-readable reason out of a 4xx JSON body. */
  describeError?: (body: unknown) => string | undefined;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", ...opts.headers, "user-agent": opts.userAgent ?? config.userAgent },
      signal: AbortSignal.timeout(opts.timeoutMs ?? config.sparrow.timeoutMs),
    });
  } catch (err) {
    const timedOut = (err as Error).name === "TimeoutError";
    throw new McpToolError(
      timedOut ? `${opts.service} took too long to respond. Try again.` : `Could not reach ${opts.service}. Try again shortly.`,
      timedOut ? 504 : 502,
      { internalMessage: `${opts.service} fetch ${url}: ${(err as Error).message}`, cause: err },
    );
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON body, handled below
  }
  log.debug("upstream", { service: opts.service, status: res.status, ms: Date.now() - started, url });

  if (!res.ok) throw upstreamError(opts.service, res.status, opts.describeError?.(body), text);
  if (body === null) {
    throw new McpToolError(`${opts.service} returned an unexpected response.`, 502, {
      internalMessage: `non-JSON ${res.status} from ${url}: ${text.slice(0, 200)}`,
    });
  }
  return body as T;
}
