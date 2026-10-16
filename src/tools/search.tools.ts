import { boundsAroundPoint, geocode } from "../api/geocode.api.js";
import { countUnits, searchUnits, type Bounds, type SearchFilters } from "../api/sparrow.api.js";
import { badInput } from "../common/errors.js";
import { fmt } from "../common/fmt.js";
import { log } from "../common/log.js";
import type { RegistrationContext } from "../common/registration.js";
import { compactUnit, snakeBounds } from "../format.js";
import { SearchRoomsInput, SearchRoomsOutput, TOOLS, type SearchRoomsArgs } from "../types/sparrow.types.js";

interface ResolvedArea {
  label: string;
  bounds: Bounds;
  source: string;
  centre?: { latitude: number; longitude: number };
  radius_km?: number;
}

export async function resolveArea(a: SearchRoomsArgs): Promise<ResolvedArea> {
  if (a.bounds) {
    const b = a.bounds;
    return {
      label: "custom bounds",
      source: "bounds",
      bounds: {
        northWestLatitude: b.north_west_latitude,
        northWestLongitude: b.north_west_longitude,
        southEastLatitude: b.south_east_latitude,
        southEastLongitude: b.south_east_longitude,
      },
    };
  }
  if (a.latitude !== undefined && a.longitude !== undefined) {
    const km = a.radius_km ?? 3;
    return {
      label: `${km} km around ${a.latitude.toFixed(5)}, ${a.longitude.toFixed(5)}`,
      source: "radius",
      bounds: boundsAroundPoint(a.latitude, a.longitude, km),
      centre: { latitude: a.latitude, longitude: a.longitude },
      radius_km: km,
    };
  }
  if (a.location) {
    const g = await geocode(a.location, a.radius_km);
    return {
      label: g.label,
      source: g.bounds_source,
      bounds: g.bounds,
      centre: { latitude: g.latitude, longitude: g.longitude },
      radius_km: g.radius_km,
    };
  }
  throw badInput('Provide a location (e.g. "Toronto, ON"), or latitude/longitude, or bounds.');
}

function validateRanges(a: SearchRoomsArgs) {
  if (a.min_price !== undefined && a.max_price !== undefined && a.min_price > a.max_price) {
    throw badInput("min_price cannot be greater than max_price.");
  }
  if (a.min_term_months !== undefined && a.max_term_months !== undefined && a.min_term_months > a.max_term_months) {
    throw badInput("min_term_months cannot be greater than max_term_months.");
  }
}

export function registerSearchTools(ctx: RegistrationContext) {
  ctx.registerTool(
    TOOLS.search_rooms,
    {
      title: "Search rooms on Sparrow",
      description: fmt.oneLine(`
        Search sparrowshare.com for rooms and co-living units for rent in a Canadian city or neighbourhood.
        Filters: price range (CAD/month), move-in date, lease length, renter gender, private vs shared bedroom, guests, pets, and listing type.
        Returns compact room summaries in Sparrow's default ranking, the total number of matches, and a cursor for the next page.
        Leave filters out unless the user asked for them: every filter narrows the results.
      `),
      inputSchema: SearchRoomsInput,
      outputSchema: SearchRoomsOutput,
    },
    async (a) => {
      validateRanges(a);
      const area = await resolveArea(a);

      const filters: SearchFilters = {
        bounds: area.bounds,
        minPrice: a.min_price,
        maxPrice: a.max_price,
        moveInDate: a.move_in_date,
        minTermLength: a.min_term_months,
        maxTermLength: a.max_term_months,
        gender: a.gender,
        bedroomPrivacy: a.bedroom_privacy,
        daytimeGuestsAllowed: a.daytime_guests_allowed,
        overnightGuestsAllowed: a.overnight_guests_allowed,
        pets: a.pets,
        listingType: a.listing_type,
        perPage: a.limit,
        cursor: a.cursor,
      };

      const [page, total] = await Promise.all([
        searchUnits(filters),
        countUnits(filters).catch((err) => {
          log.warn("count failed", { message: (err as Error).message });
          return null;
        }),
      ]);

      // Sparrow pins featured rooms to the top of every page, so later pages repeat them.
      // They were already returned on the first page; drop them from the rest.
      const units = a.cursor ? page.data.filter((u) => !u.featured_at) : page.data;
      const results = units.map(compactUnit);
      const notes: string[] = [];
      if (a.cursor && units.length < page.data.length) {
        notes.push(`${page.data.length - units.length} featured room(s) already shown on the first page were omitted.`);
      }

      return {
        search_area: {
          label: area.label,
          bounds_source: area.source,
          centre: area.centre ?? null,
          radius_km: area.radius_km ?? null,
          bounds: snakeBounds(area.bounds),
        },
        filters_applied: {
          min_price: a.min_price ?? null,
          max_price: a.max_price ?? null,
          move_in_date: a.move_in_date ?? null,
          min_term_months: a.min_term_months ?? null,
          max_term_months: a.max_term_months ?? null,
          gender: a.gender ?? null,
          bedroom_privacy: a.bedroom_privacy ?? null,
          daytime_guests_allowed: a.daytime_guests_allowed ?? null,
          overnight_guests_allowed: a.overnight_guests_allowed ?? null,
          pets: a.pets ?? [],
          listing_type: a.listing_type ?? null,
        },
        total_matching: total,
        returned: results.length,
        next_cursor: page.next_cursor,
        ...(notes.length && { notes }),
        results,
      };
    },
  );
}
