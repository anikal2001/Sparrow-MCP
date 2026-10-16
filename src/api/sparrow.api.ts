/**
 * Thin client for the public sparrowshare.com JSON endpoints used by the web app.
 * All endpoints used here respond without authentication. Raw shapes only: turning them into
 * what the model sees is src/format.ts's job.
 */
import { config } from "../config.js";
import { fetchJson } from "../common/http-client.js";
import type { BedroomPrivacy, Gender, ListingType, Pet } from "../types/sparrow.types.js";

export interface Bounds {
  northWestLatitude: number;
  northWestLongitude: number;
  southEastLatitude: number;
  southEastLongitude: number;
}

export interface SearchFilters {
  bounds: Bounds;
  minPrice?: number;
  maxPrice?: number;
  /** YYYY-MM-DD */
  moveInDate?: string;
  minTermLength?: number;
  maxTermLength?: number;
  gender?: Gender;
  bedroomPrivacy?: BedroomPrivacy;
  daytimeGuestsAllowed?: boolean;
  overnightGuestsAllowed?: boolean;
  pets?: Pet[];
  listingType?: ListingType;
  perPage?: number;
  cursor?: string;
}

// ---------- raw API shapes (only the fields we rely on) ----------

export interface RawPhoto {
  src?: string;
  original?: string;
  alt?: string;
}

export interface RawUnit {
  id: string;
  listing_id: string;
  bedroom_id: string;
  title: string;
  secondary_title: string | null;
  type: string;
  price: number;
  photos?: RawPhoto[];
  is_verified: boolean;
  booking_available_from: string | null;
  min_booking_term_length: number | null;
  max_booking_term_length: number | null;
  city: string | null;
  province_code: string | null;
  longitude: number;
  latitude: number;
  featured_at: string | null;
  max_occupancy: string | number | null;
  preferred_gender: string | null;
  bedroom_privacy_type: string | null;
  daytime_guests_allowed: boolean | null;
  overnight_guests_allowed: boolean | null;
  bathroom_privacy_type: string | null;
  cats_allowed: boolean | null;
  small_dogs_allowed: boolean | null;
  large_dogs_allowed: boolean | null;
  caged_pets_allowed: boolean | null;
  listing_type: string | null;
  service_model: string | null;
}

export interface RawSearchResponse {
  data: RawUnit[];
  per_page: number;
  next_cursor: string | null;
  prev_cursor: string | null;
}

export interface RawBedroomOption {
  id: string;
  title: string;
  price: string | number;
  features: string[];
  bedType: string | null;
  bathroomType: string | null;
  furnished: boolean;
  isPublished: boolean;
  isOccupied: boolean;
  isOpenToApplications: boolean;
  availableFrom: string | null;
}

export interface RawListingDetail {
  listingId: string;
  title: string;
  neighborhood: string | null;
  price: string;
  availability: string | null;
  photos?: RawPhoto[];
  fromPrice: boolean;
  bio: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  amenities: string[];
  utilities: { included: string[]; notIncluded: string[] };
  sharedSpaces: string[];
  bedroom: string[];
  bedroomOptions: RawBedroomOption[];
  rules: string[];
  houseRules: { allowed: string[]; notAllowed: string[] };
  housemates: string | null;
  hostName: string | null;
  leaseTerm: string | null;
  latitude: number;
  longitude: number;
  links?: { listing?: string };
}

export interface RawCity {
  city: string;
  province_code: string;
  label: string;
}

// ---------- HTTP ----------

/** Laravel-style validation body: { message, errors: { field: [reasons] } }. */
function describeSparrowError(body: unknown): string | undefined {
  const b = body as { message?: string; errors?: Record<string, string[]> } | null;
  if (b?.errors) return Object.values(b.errors).flat().join(" ");
  return b?.message;
}

function sparrowGet<T>(path: string, params?: URLSearchParams): Promise<T> {
  const query = params?.toString();
  return fetchJson<T>(`${config.sparrow.baseUrl}${path}${query ? `?${query}` : ""}`, {
    service: "Sparrow",
    headers: { accept: "application/json, text/plain, */*", "x-requested-with": "XMLHttpRequest" },
    describeError: describeSparrowError,
  });
}

export function buildSearchParams(f: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  p.set("northWestLongitude", String(f.bounds.northWestLongitude));
  p.set("northWestLatitude", String(f.bounds.northWestLatitude));
  p.set("southEastLongitude", String(f.bounds.southEastLongitude));
  p.set("southEastLatitude", String(f.bounds.southEastLatitude));
  if (f.perPage !== undefined) p.set("perPage", String(f.perPage));
  if (f.minPrice !== undefined) p.set("minPrice", String(f.minPrice));
  if (f.maxPrice !== undefined) p.set("maxPrice", String(f.maxPrice));
  if (f.moveInDate) p.set("moveInDate", f.moveInDate);
  if (f.minTermLength !== undefined) p.set("minTermLength", String(f.minTermLength));
  if (f.maxTermLength !== undefined) p.set("maxTermLength", String(f.maxTermLength));
  if (f.gender) p.set("gender", f.gender);
  if (f.bedroomPrivacy) p.set("bedroomPrivacy", f.bedroomPrivacy);
  if (f.daytimeGuestsAllowed) p.set("daytimeGuestsAllowed", "1");
  if (f.overnightGuestsAllowed) p.set("overnightGuestsAllowed", "1");
  f.pets?.forEach((pet, i) => p.set(`pets[${i}]`, pet));
  if (f.listingType) p.set("listingType", f.listingType);
  if (f.cursor) p.set("cursor", f.cursor);
  return p;
}

export function searchUnits(f: SearchFilters): Promise<RawSearchResponse> {
  return sparrowGet<RawSearchResponse>("/api/search/units", buildSearchParams(f));
}

export async function countUnits(f: SearchFilters): Promise<number> {
  const r = await sparrowGet<{ count: number }>(
    "/api/search/units/count",
    buildSearchParams({ ...f, perPage: undefined, cursor: undefined }),
  );
  return r.count;
}

export function getListingDetail(listingId: string): Promise<RawListingDetail> {
  return sparrowGet<RawListingDetail>(`/api/discover/listings/${encodeURIComponent(listingId)}`);
}

export async function listCities(): Promise<RawCity[]> {
  const r = await sparrowGet<{ cities: RawCity[] }>("/api/search/cities");
  return r.cities ?? [];
}

export function listingUrl(listingId: string): string {
  return `${config.sparrow.baseUrl}/app/discover/listings/${listingId}`;
}
