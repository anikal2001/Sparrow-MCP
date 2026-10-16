/**
 * Tool names, enum values and every zod parameter/output schema, kept apart from handlers so
 * tools, prompts and tests share one definition.
 */
import { z } from "zod";

// ---- Tool and prompt names --------------------------------------------------

export const TOOLS = {
  search_rooms: "search_rooms",
  get_listing_details: "get_listing_details",
  list_cities: "list_cities",
} as const;

export const PROMPTS = {
  find_a_room: "find_a_room",
} as const;

// ---- Values the Sparrow site itself uses (unknown values are silently ignored upstream) ----

export const GENDERS = ["Female", "Male", "Non-binary"] as const;
export const BEDROOM_PRIVACY = ["Private", "Shared"] as const;
export const PETS = ["Cats Allowed", "Small Dogs Allowed", "Large Dogs Allowed", "Caged Pets Allowed"] as const;
export const LISTING_TYPES = ["HOMESHARE", "COLIVING", "ENTIRE_UNIT"] as const;

export type Gender = (typeof GENDERS)[number];
export type BedroomPrivacy = (typeof BEDROOM_PRIVACY)[number];
export type Pet = (typeof PETS)[number];
export type ListingType = (typeof LISTING_TYPES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- search_rooms input ------------------------------------------------------

export const BoundsParam = z.object({
  north_west_latitude: z.number().min(-90).max(90),
  north_west_longitude: z.number().min(-180).max(180),
  south_east_latitude: z.number().min(-90).max(90),
  south_east_longitude: z.number().min(-180).max(180),
});

export const SearchRoomsInput = {
  location: z
    .string()
    .min(1)
    .optional()
    .describe(
      'Where to search: a city ("Toronto, ON"), neighbourhood ("Liberty Village, Toronto"), intersection, address, or postal code. Required unless bounds or latitude/longitude are given. Sparrow currently lists rooms in Canadian cities.',
    ),
  radius_km: z
    .number()
    .positive()
    .max(100)
    .optional()
    .describe(
      'Search within this many km of the location instead of the location\'s own boundary. Use for addresses, intersections or "near X" requests (e.g. 2 for walking distance). Defaults to the city boundary for cities and 3 km for points.',
    ),
  latitude: z.number().min(-90).max(90).optional().describe("Centre latitude. Use with longitude and radius_km instead of location."),
  longitude: z.number().min(-180).max(180).optional().describe("Centre longitude. Use with latitude and radius_km instead of location."),
  bounds: BoundsParam.optional().describe(
    "Explicit map bounding box. Only needed when paging or reusing search_area.bounds from a previous result.",
  ),
  min_price: z.number().int().min(0).optional().describe("Minimum monthly rent in CAD."),
  max_price: z.number().int().min(0).optional().describe("Maximum monthly rent in CAD."),
  move_in_date: z
    .string()
    .regex(ISO_DATE, "Use YYYY-MM-DD")
    .optional()
    .describe("Desired move-in date, YYYY-MM-DD. Only rooms available on or before this date are returned."),
  min_term_months: z.number().int().min(1).max(24).optional().describe("Shortest lease the user is willing to sign, in months."),
  max_term_months: z
    .number()
    .int()
    .min(1)
    .max(24)
    .optional()
    .describe("Longest lease the user is willing to sign, in months (e.g. 6 if they only want up to 6 months). Omit for no maximum."),
  gender: z
    .enum(GENDERS)
    .optional()
    .describe("The renter's gender. Returns rooms open to that gender (hosts may restrict to Female only or Male only)."),
  bedroom_privacy: z.enum(BEDROOM_PRIVACY).optional().describe('"Private" for their own bedroom, "Shared" for a shared bedroom.'),
  daytime_guests_allowed: z.boolean().optional().describe("Set true if the user needs to be able to have daytime guests."),
  overnight_guests_allowed: z.boolean().optional().describe("Set true if the user needs to be able to have overnight guests."),
  pets: z.array(z.enum(PETS)).optional().describe("Pets the user has; only homes that allow all of them are returned."),
  listing_type: z
    .enum(LISTING_TYPES)
    .optional()
    .describe(
      "HOMESHARE = a room in someone's home (host lives there). COLIVING = a room in a shared co-living unit. ENTIRE_UNIT = a whole apartment. Omit to include all.",
    ),
  limit: z.number().int().min(1).max(200).default(25).describe("Maximum rooms to return per page (1-200)."),
  cursor: z.string().optional().describe("next_cursor from a previous response, to fetch the following page. Reuse the same filters and bounds."),
};

export type SearchRoomsArgs = z.objectOutputType<typeof SearchRoomsInput, z.ZodTypeAny>;

// ---- get_listing_details input ----------------------------------------------

export const GetListingInput = {
  listing_id: z.string().uuid().describe("The listing_id of a result from search_rooms."),
};

// ---- Output schemas ----------------------------------------------------------
// Upstream fields can be null at any time, so everything not guaranteed by Sparrow is nullable.

const str = z.string().nullable();
const num = z.number().nullable();
const bool = z.boolean().nullable();

export const RoomSummary = z.object({
  unit_id: z.string(),
  listing_id: z.string(),
  bedroom_id: str,
  title: z.string(),
  room: str,
  price_cad_per_month: num,
  city: str,
  province: str,
  listing_type: str,
  service_model: str,
  available_from: str,
  term_months: z.object({ min: num, max: num }),
  preferred_gender: str,
  bedroom_privacy: str,
  bathroom_privacy: str,
  max_occupancy: num.describe('Sparrow caps this at "4+", so 4 means 4 or more.'),
  guests: z.object({ daytime: bool, overnight: bool }),
  pets: z.object({ cats: bool, small_dogs: bool, large_dogs: bool, caged_pets: bool }),
  verified: bool,
  featured: z.boolean(),
  latitude: num,
  longitude: num,
  photo: str,
  url: z.string().describe("Public listing page; always give this to the user."),
});

export const SearchRoomsOutput = {
  search_area: z.object({
    label: z.string(),
    bounds_source: z.string(),
    centre: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
    radius_km: num,
    bounds: BoundsParam.describe("Pass back as `bounds` with next_cursor to fetch the next page."),
  }),
  filters_applied: z.record(z.unknown()),
  total_matching: num.describe("Total rooms matching the filters, or null if the count was unavailable."),
  returned: z.number(),
  next_cursor: str,
  notes: z.array(z.string()).optional(),
  results: z.array(RoomSummary),
};

export const ListingDetailOutput = {
  listing_id: z.string(),
  title: z.string(),
  neighborhood: str,
  price: str,
  price_is_starting_from: bool,
  availability: str,
  lease_term: str,
  description: str,
  bedrooms: str,
  bathrooms: str,
  housemates: str,
  host_name: str,
  amenities: z.array(z.string()),
  utilities: z.object({ included: z.array(z.string()), notIncluded: z.array(z.string()) }),
  shared_spaces: z.array(z.string()),
  bedroom_features: z.array(z.string()),
  house_rules: z.object({ allowed: z.array(z.string()), notAllowed: z.array(z.string()) }),
  rules: z.array(z.string()),
  rooms: z.array(
    z.object({
      bedroom_id: z.string(),
      title: str,
      price_cad_per_month: num,
      bed_type: str,
      bathroom: str,
      furnished: bool,
      features: z.array(z.string()),
      available_from: str,
      currently_listed: z.boolean(),
      occupied: bool,
    }),
  ),
  latitude: num,
  longitude: num,
  photos: z.array(z.string()),
  url: z.string(),
};

export const ListCitiesOutput = {
  cities: z.array(z.object({ city: z.string(), province: str, label: z.string() })),
};
