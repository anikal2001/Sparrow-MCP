/**
 * Test harness: an in-memory MCP client connected to a fresh server, and a fetch stub that
 * routes outbound requests by URL so tests never touch the network.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { vi } from "vitest";
import { createServer } from "../src/server.js";

export async function connectClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    async close() {
      await client.close();
      await server.close();
    },
  };
}

type Route = { match: (url: URL) => boolean; respond: (url: URL) => Response | Promise<Response> };

/** Replaces global fetch. Unmatched URLs fail the test loudly. Returns the list of requested URLs. */
export function mockFetch(routes: Route[]) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      calls.push(url);
      const route = routes.find((r) => r.match(url));
      if (!route) throw new Error(`Unmocked fetch: ${url}`);
      return route.respond(url);
    }),
  );
  return calls;
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const path = (p: string) => (url: URL) => url.pathname === p;
export const host = (h: string) => (url: URL) => url.hostname === h;

export const TORONTO_HIT = {
  display_name: "Toronto, Ontario, Canada",
  lat: "43.6534817",
  lon: "-79.3839347",
  category: "boundary",
  addresstype: "city",
  boundingbox: ["43.5810", "43.8554", "-79.6393", "-79.1152"],
};

export function unit(overrides: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    listing_id: "11111111-1111-4111-8111-111111111111",
    bedroom_id: "b-1",
    title: "Bright room near the subway",
    secondary_title: "Room 1",
    type: "bedroom",
    price: 900,
    photos: [{ src: "https://img/1.jpg" }],
    is_verified: true,
    booking_available_from: "2026-11-01",
    min_booking_term_length: 4,
    max_booking_term_length: 12,
    city: "Toronto",
    province_code: "ON",
    longitude: -79.38,
    latitude: 43.65,
    featured_at: null,
    max_occupancy: "1",
    preferred_gender: null,
    bedroom_privacy_type: "Private",
    daytime_guests_allowed: true,
    overnight_guests_allowed: false,
    bathroom_privacy_type: "Shared",
    cats_allowed: true,
    small_dogs_allowed: false,
    large_dogs_allowed: false,
    caged_pets_allowed: null,
    listing_type: "HOMESHARE",
    service_model: null,
    ...overrides,
  };
}
