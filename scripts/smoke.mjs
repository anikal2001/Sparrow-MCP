// End-to-end smoke test: launches the built stdio server as a real MCP client would
// and exercises each tool against the live Sparrow API.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(here, "..", "dist", "stdio.js");

const client = new Client({ name: "smoke", version: "0.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [serverPath] }));

let failures = 0;
function check(label, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}${extra ? " " + extra : ""}`);
  if (!cond) failures++;
}
function parse(res) {
  return JSON.parse(res.content[0].text);
}

const tools = await client.listTools();
check("lists 3 tools", tools.tools.length === 3, tools.tools.map((t) => t.name).join(","));

const cities = await client.callTool({ name: "list_cities", arguments: {} });
const cityList = parse(cities).cities;
check("list_cities returns cities", Array.isArray(cityList) && cityList.length > 0, `${cityList.length} cities`);

const plain = parse(
  await client.callTool({ name: "search_rooms", arguments: { location: "Toronto, ON", limit: 5 } }),
);
check("search by city geocodes to an area", plain.search_area?.bounds_source === "area", plain.search_area?.label);
check("search returns results", plain.returned > 0 && plain.results.length === plain.returned, `${plain.returned}/${plain.total_matching}`);
check("results carry url + listing_id", plain.results.every((r) => r.url && r.listing_id));
check("next_cursor present when more pages", plain.total_matching > 5 ? Boolean(plain.next_cursor) : true);

if (plain.next_cursor) {
  const page2 = parse(
    await client.callTool({
      name: "search_rooms",
      arguments: { bounds: plain.search_area.bounds, limit: 5, cursor: plain.next_cursor },
    }),
  );
  const ids1 = new Set(plain.results.map((r) => r.unit_id));
  check("page 2 via cursor returns different rooms", page2.returned > 0 && !page2.results.some((r) => ids1.has(r.unit_id)));
}

const filtered = parse(
  await client.callTool({
    name: "search_rooms",
    arguments: {
      location: "Toronto",
      max_price: 1000,
      bedroom_privacy: "Private",
      gender: "Female",
      listing_type: "HOMESHARE",
      move_in_date: "2026-12-01",
      limit: 50,
    },
  }),
);
check("filtered search respects max_price", filtered.results.every((r) => r.price_cad_per_month <= 1000), `${filtered.returned} rooms`);
check("filtered search respects listing_type", filtered.results.every((r) => r.listing_type === "HOMESHARE"));
check("filtered search respects privacy", filtered.results.every((r) => r.bedroom_privacy === "Private"));
check("filtered search respects gender", filtered.results.every((r) => r.preferred_gender !== "Male Only"));

const radius = parse(
  await client.callTool({ name: "search_rooms", arguments: { location: "Yonge and Eglinton, Toronto", radius_km: 2, limit: 5 } }),
);
check("intersection search uses a radius box", radius.search_area?.bounds_source === "radius" && radius.search_area?.radius_km === 2, radius.search_area?.label);

const first = plain.results[0];
const detail = parse(await client.callTool({ name: "get_listing_details", arguments: { listing_id: first.listing_id } }));
check("listing details returned", detail.listing_id === first.listing_id && typeof detail.title === "string", detail.title);
check("listing details include rooms", Array.isArray(detail.rooms) && detail.rooms.length > 0, `${detail.rooms?.length} rooms`);

const bad = await client.callTool({ name: "search_rooms", arguments: { limit: 5 } });
check("missing location is a tool error", bad.isError === true, bad.content?.[0]?.text);

const nowhere = await client.callTool({ name: "search_rooms", arguments: { location: "zzqx nonexistent place 12345", limit: 5 } });
check("unknown place is a tool error", nowhere.isError === true, nowhere.content?.[0]?.text?.slice(0, 60));

await client.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
