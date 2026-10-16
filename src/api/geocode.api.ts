/**
 * Turns a free-text place ("Toronto", "Yonge and Eglinton", "M5V 2T6") into the
 * map bounding box that the Sparrow search API requires.
 *
 * Uses OpenStreetMap Nominatim. Its usage policy requires an identifying
 * User-Agent and at most one request per second, both handled here.
 */
import { config } from "../config.js";
import { badInput } from "../common/errors.js";
import { fetchJson } from "../common/http-client.js";
import type { Bounds } from "./sparrow.api.js";

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
  bounds: Bounds;
  /** "area" when the result's own boundary was used, "radius" when a box was drawn around a point. */
  bounds_source: "area" | "radius";
  radius_km?: number;
}

interface NominatimHit {
  display_name: string;
  lat: string;
  lon: string;
  category?: string;
  class?: string;
  type?: string;
  addresstype?: string;
  boundingbox: [string, string, string, string]; // south, north, west, east
}

const AREA_TYPES = new Set([
  "city", "town", "village", "hamlet", "municipality", "borough", "suburb", "neighbourhood",
  "quarter", "city_district", "district", "county", "state", "province", "region", "island", "postcode",
]);

/** Insertion-ordered Map used as an LRU, so a long-running HTTP server does not grow without bound. */
const cache = new Map<string, GeocodeResult>();
let lastRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

function cacheGet(key: string): GeocodeResult | undefined {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: GeocodeResult) {
  cache.set(key, value);
  if (cache.size > config.geocoder.cacheSize) cache.delete(cache.keys().next().value!);
}

/** Test hook. */
export function clearGeocodeCache() {
  cache.clear();
  lastRequestAt = 0;
}

/** Serialises Nominatim calls so we never exceed one request per second. */
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastRequestAt + config.geocoder.minGapMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => undefined);
  return run;
}

export function boundsAroundPoint(latitude: number, longitude: number, radiusKm: number): Bounds {
  const dLat = radiusKm / 110.574;
  const dLng = radiusKm / (111.32 * Math.cos((latitude * Math.PI) / 180));
  return {
    northWestLatitude: latitude + dLat,
    northWestLongitude: longitude - dLng,
    southEastLatitude: latitude - dLat,
    southEastLongitude: longitude + dLng,
  };
}

export async function geocode(query: string, radiusKm?: number): Promise<GeocodeResult> {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) throw badInput("Location is empty.");
  const key = `${q.toLowerCase()}|${radiusKm ?? ""}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const params = new URLSearchParams({ q, format: "jsonv2", limit: "1" });
  if (config.geocoder.countryCodes) params.set("countrycodes", config.geocoder.countryCodes);

  const results = await throttled(() =>
    fetchJson<NominatimHit[]>(`${config.geocoder.url}?${params}`, {
      service: "The geocoder",
      userAgent: config.geocoder.userAgent,
    }),
  );

  const r = results[0];
  if (!r) {
    throw badInput(
      `Could not find a place matching "${q}". Try a city name such as "Toronto, ON", a neighbourhood, an intersection, or a postal code.`,
    );
  }

  const latitude = Number(r.lat);
  const longitude = Number(r.lon);
  const isArea = (r.category ?? r.class) === "boundary" || AREA_TYPES.has(r.addresstype ?? r.type ?? "");

  let result: GeocodeResult;
  if (radiusKm === undefined && isArea) {
    const [south, north, west, east] = r.boundingbox.map(Number);
    result = {
      label: r.display_name,
      latitude,
      longitude,
      bounds: { northWestLatitude: north, northWestLongitude: west, southEastLatitude: south, southEastLongitude: east },
      bounds_source: "area",
    };
  } else {
    const km = radiusKm ?? config.geocoder.defaultRadiusKm;
    result = {
      label: r.display_name,
      latitude,
      longitude,
      bounds: boundsAroundPoint(latitude, longitude, km),
      bounds_source: "radius",
      radius_km: km,
    };
  }
  cacheSet(key, result);
  return result;
}
