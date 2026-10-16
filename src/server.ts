import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./config.js";
import { fmt } from "./common/fmt.js";
import { createRegistrationContext } from "./common/registration.js";
import { registerPrompts } from "./prompts/find-room.prompts.js";
import { registerListingTools } from "./tools/listing.tools.js";
import { registerSearchTools } from "./tools/search.tools.js";

export const SERVER_NAME = config.server.name;
export const SERVER_VERSION = config.server.version;

const INSTRUCTIONS = fmt.oneLine(`
  Tools for finding rooms for rent on sparrowshare.com (Sparrow), a Canadian room-rental and co-living marketplace.
  Use search_rooms to turn a renter's request into a search: map their city or neighbourhood to \`location\`, budget to min_price/max_price,
  timing to move_in_date, lease length to max_term_months, and any pets, guest or privacy needs to the matching filters.
  Use get_listing_details for the description, amenities, house rules and other rooms of a specific listing.
  Always give users the listing url so they can view and apply.
`);

/** Builds a fresh server with every tool and prompt. Each transport connection gets its own. */
export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: INSTRUCTIONS });
  const ctx = createRegistrationContext(server);

  registerSearchTools(ctx);
  registerListingTools(ctx);
  registerPrompts(ctx);

  return server;
}
