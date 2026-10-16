/**
 * The only way tool modules touch the McpServer. Keeping the raw server private means every
 * tool gets the same result formatting, error mapping and timing logs, and none can skip them.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, GetPromptResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { toToolError } from "./errors.js";
import { fmt } from "./fmt.js";
import { log } from "./log.js";

type Shape = z.ZodRawShape;
type Infer<S extends Shape> = z.objectOutputType<S, z.ZodTypeAny>;

export interface ToolConfig<In extends Shape, Out extends Shape> {
  title: string;
  description: string;
  inputSchema: In;
  /** Declares the shape of structuredContent so clients can rely on it. */
  outputSchema?: Out;
  /** Merged over READ_ONLY_TOOL, since every Sparrow tool only reads public data. */
  annotations?: ToolAnnotations;
}

/** Tool handlers return plain data; the wrapper turns it into a CallToolResult. */
export type ToolHandler<In extends Shape, Out extends Shape> = (args: Infer<In>) => Promise<Infer<Out> | Record<string, unknown>>;

export interface PromptConfig<Args extends Shape> {
  title: string;
  description: string;
  argsSchema: Args;
}

export interface RegistrationContext {
  registerTool<In extends Shape, Out extends Shape = Shape>(
    name: string,
    config: ToolConfig<In, Out>,
    handler: ToolHandler<In, Out>,
  ): void;
  registerPrompt<Args extends Shape>(
    name: string,
    config: PromptConfig<Args>,
    handler: (args: Infer<Args>) => GetPromptResult | Promise<GetPromptResult>,
  ): void;
}

export const READ_ONLY_TOOL: ToolAnnotations = { readOnlyHint: true, openWorldHint: true, idempotentHint: true };

export function createRegistrationContext(server: McpServer): RegistrationContext {
  return {
    registerTool(name, { annotations, ...config }, handler) {
      server.registerTool(
        name,
        { ...config, annotations: { ...READ_ONLY_TOOL, title: config.title, ...annotations } },
        // The SDK's callback type is conditional on the schema generics; erase it only at this seam.
        (async (args: never) => runTool(name, () => handler(args))) as never,
      );
    },
    registerPrompt(name, config, handler) {
      server.registerPrompt(name, config, handler as never);
    },
  };
}

async function runTool(name: string, call: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  const started = Date.now();
  try {
    const payload = await call();
    log.info("tool", { tool: name, ms: Date.now() - started });
    return { content: [{ type: "text", text: fmt.json(payload) }], structuredContent: payload };
  } catch (err) {
    const e = toToolError(err);
    log[e.isServerError ? "error" : "warn"]("tool failed", {
      tool: name,
      ms: Date.now() - started,
      status: e.status,
      message: e.message,
      internal: e.internalMessage,
    });
    return { isError: true, content: [{ type: "text", text: e.message }] };
  }
}
