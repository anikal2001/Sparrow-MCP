import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearGeocodeCache } from "../src/api/geocode.api.js";
import { PROMPTS, TOOLS } from "../src/types/sparrow.types.js";
import { TORONTO_HIT, connectClient, host, json, mockFetch, path, unit } from "./helpers.js";

let session: Awaited<ReturnType<typeof connectClient>>;

beforeEach(async () => {
  clearGeocodeCache();
  session = await connectClient();
});
afterEach(async () => {
  await session.close();
  vi.unstubAllGlobals();
});

const text = (r: Record<string, unknown>) => (r.content as { text: string }[])[0].text;

describe("server surface", () => {
  it("exposes every tool as read-only with input and output schemas", async () => {
    const { tools } = await session.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(Object.values(TOOLS).sort());
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
      expect(t.outputSchema, t.name).toBeDefined();
      expect(t.description!.length).toBeGreaterThan(40);
    }
    const search = tools.find((t) => t.name === TOOLS.search_rooms)!;
    expect(Object.keys(search.inputSchema.properties!)).toEqual(expect.arrayContaining(["location", "max_price", "cursor"]));
  });

  it("exposes the find_a_room prompt", async () => {
    const { prompts } = await session.client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual([PROMPTS.find_a_room]);
    const p = await session.client.getPrompt({ name: PROMPTS.find_a_room, arguments: { city: "Montreal", budget: "$1,000" } });
    const msg = (p.messages[0].content as { text: string }).text;
    expect(msg).toContain("Montreal");
    expect(msg).toContain("$1000");
    expect(msg).toContain(TOOLS.search_rooms);
  });
});

describe("search_rooms", () => {
  it("geocodes a city, encodes filters, and returns structured results", async () => {
    const calls = mockFetch([
      { match: host("nominatim.openstreetmap.org"), respond: () => json([TORONTO_HIT]) },
      { match: path("/api/search/units/count"), respond: () => json({ count: 42 }) },
      {
        match: path("/api/search/units"),
        respond: () => json({ data: [unit(), unit({ id: "u-big", max_occupancy: "4+" })], per_page: 5, next_cursor: "abc", prev_cursor: null }),
      },
    ]);

    const res = await session.client.callTool({
      name: TOOLS.search_rooms,
      arguments: { location: "Toronto", max_price: 1000, pets: ["Cats Allowed"], overnight_guests_allowed: true, limit: 5 },
    });

    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as any;
    expect(out.search_area).toMatchObject({ bounds_source: "area", label: "Toronto, Ontario, Canada" });
    expect(out.total_matching).toBe(42);
    expect(out.next_cursor).toBe("abc");
    expect(out.results[0]).toMatchObject({ unit_id: "u-1", price_cad_per_month: 900, max_occupancy: 1 });
    expect(out.results[1].max_occupancy).toBe(4);
    expect(out.results[0].url).toMatch(/\/app\/discover\/listings\/11111111-/);
    expect(JSON.parse(text(res))).toEqual(out);

    const search = calls.find((u) => u.pathname === "/api/search/units")!;
    expect(search.searchParams.get("maxPrice")).toBe("1000");
    expect(search.searchParams.get("pets[0]")).toBe("Cats Allowed");
    expect(search.searchParams.get("overnightGuestsAllowed")).toBe("1");
    expect(search.searchParams.get("perPage")).toBe("5");
    expect(search.searchParams.get("northWestLatitude")).toBe("43.8554");
    const count = calls.find((u) => u.pathname === "/api/search/units/count")!;
    expect(count.searchParams.has("perPage")).toBe(false);
  });

  it("drops featured rooms that Sparrow repeats on later pages", async () => {
    mockFetch([
      { match: path("/api/search/units/count"), respond: () => json({ count: 10 }) },
      {
        match: path("/api/search/units"),
        respond: () =>
          json({
            data: [unit({ id: "featured", featured_at: "2026-01-01" }), unit({ id: "u-2" }), unit({ id: "u-3" })],
            per_page: 3,
            next_cursor: "next",
            prev_cursor: null,
          }),
      },
    ]);
    const bounds = { north_west_latitude: 44, north_west_longitude: -80, south_east_latitude: 43, south_east_longitude: -79 };

    const first = (await session.client.callTool({ name: TOOLS.search_rooms, arguments: { bounds } })).structuredContent as any;
    expect(first.results.map((r: any) => r.unit_id)).toEqual(["featured", "u-2", "u-3"]);

    const later = (await session.client.callTool({ name: TOOLS.search_rooms, arguments: { bounds, cursor: "next" } }))
      .structuredContent as any;
    expect(later.results.map((r: any) => r.unit_id)).toEqual(["u-2", "u-3"]);
    expect(later.notes[0]).toMatch(/featured/);
  });

  it("uses a radius box for coordinates without calling the geocoder", async () => {
    const calls = mockFetch([
      { match: path("/api/search/units/count"), respond: () => json({ count: 0 }) },
      { match: path("/api/search/units"), respond: () => json({ data: [], per_page: 25, next_cursor: null, prev_cursor: null }) },
    ]);
    const res = await session.client.callTool({
      name: TOOLS.search_rooms,
      arguments: { latitude: 43.7, longitude: -79.4, radius_km: 2 },
    });
    expect((res.structuredContent as any).search_area).toMatchObject({ bounds_source: "radius", radius_km: 2 });
    expect(calls.some((u) => u.hostname.includes("nominatim"))).toBe(false);
  });

  it("still answers when the count endpoint fails", async () => {
    mockFetch([
      { match: path("/api/search/units/count"), respond: () => json({}, 500) },
      { match: path("/api/search/units"), respond: () => json({ data: [unit()], per_page: 25, next_cursor: null, prev_cursor: null }) },
    ]);
    const bounds = { north_west_latitude: 44, north_west_longitude: -80, south_east_latitude: 43, south_east_longitude: -79 };
    const res = await session.client.callTool({ name: TOOLS.search_rooms, arguments: { bounds } });
    expect(res.isError).toBeFalsy();
    expect((res.structuredContent as any).total_matching).toBeNull();
  });

  it.each([
    [{}, /Provide a location/],
    [{ location: "Toronto", min_price: 900, max_price: 500 }, /min_price cannot be greater/],
    [{ location: "Toronto", min_term_months: 12, max_term_months: 4 }, /min_term_months cannot be greater/],
  ])("rejects bad input %j as a tool error", async (args, message) => {
    mockFetch([]);
    const res = await session.client.callTool({ name: TOOLS.search_rooms, arguments: args });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(message);
  });

  it("reports an unknown place clearly", async () => {
    mockFetch([{ match: host("nominatim.openstreetmap.org"), respond: () => json([]) }]);
    const res = await session.client.callTool({ name: TOOLS.search_rooms, arguments: { location: "zzqx nowhere" } });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/Could not find a place matching "zzqx nowhere"/);
  });

  it("caches geocoding results", async () => {
    const calls = mockFetch([
      { match: host("nominatim.openstreetmap.org"), respond: () => json([TORONTO_HIT]) },
      { match: path("/api/search/units/count"), respond: () => json({ count: 0 }) },
      { match: path("/api/search/units"), respond: () => json({ data: [], per_page: 25, next_cursor: null, prev_cursor: null }) },
    ]);
    await session.client.callTool({ name: TOOLS.search_rooms, arguments: { location: "Toronto" } });
    await session.client.callTool({ name: TOOLS.search_rooms, arguments: { location: "  toronto " } });
    expect(calls.filter((u) => u.hostname.includes("nominatim"))).toHaveLength(1);
  });
});

describe("upstream errors", () => {
  const bounds = { north_west_latitude: 44, north_west_longitude: -80, south_east_latitude: 43, south_east_longitude: -79 };

  it("hides 5xx bodies from the model", async () => {
    mockFetch([
      { match: path("/api/search/units/count"), respond: () => json({}, 500) },
      { match: path("/api/search/units"), respond: () => new Response("<html>stack trace secret</html>", { status: 503 }) },
    ]);
    const res = await session.client.callTool({ name: TOOLS.search_rooms, arguments: { bounds } });
    expect(res.isError).toBe(true);
    expect(text(res)).toBe("Sparrow is unavailable right now. Try again shortly.");
  });

  it("passes 4xx validation reasons through", async () => {
    mockFetch([
      { match: path("/api/search/units/count"), respond: () => json({}, 500) },
      {
        match: path("/api/search/units"),
        respond: () => json({ message: "Invalid", errors: { moveInDate: ["The move in date must be after today."] } }, 422),
      },
    ]);
    const res = await session.client.callTool({ name: TOOLS.search_rooms, arguments: { bounds, move_in_date: "2020-01-01" } });
    expect(res.isError).toBe(true);
    expect(text(res)).toBe("Sparrow rejected the request: The move in date must be after today.");
  });

  it("turns network failures into a retryable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
    const res = await session.client.callTool({ name: TOOLS.list_cities, arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toBe("Could not reach Sparrow. Try again shortly.");
  });
});

describe("get_listing_details and list_cities", () => {
  it("maps a listing", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    mockFetch([
      {
        match: path(`/api/discover/listings/${id}`),
        respond: () =>
          json({
            listingId: id,
            title: "Sunny house",
            neighborhood: "Annex",
            price: "$900",
            availability: "Now",
            fromPrice: true,
            bio: "Nice",
            bedrooms: "3",
            bathrooms: "2",
            amenities: ["Wifi"],
            utilities: { included: ["Heat"], notIncluded: [] },
            sharedSpaces: [],
            bedroom: [],
            bedroomOptions: [
              {
                id: "b1",
                title: "Room A",
                price: "900.00",
                features: [],
                bedType: "Queen",
                bathroomType: "Shared",
                furnished: true,
                isPublished: true,
                isOccupied: false,
                isOpenToApplications: true,
                availableFrom: "2026-11-01T00:00:00Z",
              },
            ],
            rules: [],
            houseRules: { allowed: [], notAllowed: ["Smoking"] },
            housemates: null,
            hostName: "Sam",
            leaseTerm: "4-12 months",
            latitude: 43.67,
            longitude: -79.4,
            photos: [{ src: "a" }, { original: "b" }, {}],
          }),
      },
    ]);
    const res = await session.client.callTool({ name: TOOLS.get_listing_details, arguments: { listing_id: id } });
    expect(res.isError).toBeFalsy();
    const out = res.structuredContent as any;
    expect(out.rooms[0]).toMatchObject({ price_cad_per_month: 900, available_from: "2026-11-01", currently_listed: true });
    expect(out.photos).toEqual(["a", "b"]);
  });

  it("says when a listing does not exist", async () => {
    mockFetch([{ match: () => true, respond: () => json({ message: "Not found" }, 404) }]);
    const res = await session.client.callTool({
      name: TOOLS.get_listing_details,
      arguments: { listing_id: "33333333-3333-4333-8333-333333333333" },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/no record matching/);
  });

  it("lists cities", async () => {
    mockFetch([
      { match: path("/api/search/cities"), respond: () => json({ cities: [{ city: "Toronto", province_code: "ON", label: "Toronto, ON" }] }) },
    ]);
    const res = await session.client.callTool({ name: TOOLS.list_cities, arguments: {} });
    expect(res.structuredContent).toEqual({ cities: [{ city: "Toronto", province: "ON", label: "Toronto, ON" }] });
  });
});
