/**
 * Errors that carry two messages: one safe and useful for the model, one for our logs.
 * Tool handlers throw these; the registration wrapper turns them into tool results.
 */

export class McpToolError extends Error {
  /** HTTP-style status: 4xx means the request was wrong, 5xx means something upstream broke. */
  readonly status: number;
  /** Detail for logs only; never shown to the model. */
  readonly internalMessage?: string;

  constructor(message: string, status = 400, opts: { internalMessage?: string; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = "McpToolError";
    this.status = status;
    this.internalMessage = opts.internalMessage;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

/** A problem with the caller's arguments that the model can fix and retry. */
export function badInput(message: string): McpToolError {
  return new McpToolError(message, 400);
}

/**
 * Maps a failed upstream response to a tool error. 4xx keeps the upstream explanation, since it
 * usually says which argument was wrong. 5xx and network failures hide the raw body.
 */
export function upstreamError(service: string, status: number, detail?: string, rawBody?: string): McpToolError {
  const internalMessage = `${service} ${status}${rawBody ? `: ${rawBody.slice(0, 500)}` : ""}`;
  if (status === 404) return new McpToolError(`${service} has no record matching that id.`, 404, { internalMessage });
  if (status === 429) {
    return new McpToolError(`${service} is rate limiting requests. Wait a few seconds and try again.`, 429, { internalMessage });
  }
  if (status >= 400 && status < 500) {
    return new McpToolError(`${service} rejected the request${detail ? `: ${detail}` : "."}`, status, { internalMessage });
  }
  return new McpToolError(`${service} is unavailable right now. Try again shortly.`, 502, { internalMessage });
}

export function toToolError(err: unknown): McpToolError {
  if (err instanceof McpToolError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new McpToolError("Unexpected error while running the tool.", 500, { internalMessage: message, cause: err });
}
