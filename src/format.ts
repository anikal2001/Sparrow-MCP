/** Raw Sparrow shapes to the compact, snake_case shapes the model sees. */
import { listingUrl, type Bounds, type RawListingDetail, type RawUnit } from "./api/sparrow.api.js";

/** Leading number of a value like 900, "900.00" or "4+"; null when there is none. */
export function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function compactUnit(u: RawUnit) {
  return {
    unit_id: u.id,
    listing_id: u.listing_id,
    bedroom_id: u.bedroom_id,
    title: u.title,
    room: u.secondary_title,
    price_cad_per_month: u.price,
    city: u.city,
    province: u.province_code,
    listing_type: u.listing_type,
    service_model: u.service_model,
    available_from: u.booking_available_from,
    term_months: { min: u.min_booking_term_length, max: u.max_booking_term_length },
    preferred_gender: u.preferred_gender,
    bedroom_privacy: u.bedroom_privacy_type,
    bathroom_privacy: u.bathroom_privacy_type,
    max_occupancy: toNumber(u.max_occupancy),
    guests: { daytime: u.daytime_guests_allowed, overnight: u.overnight_guests_allowed },
    pets: {
      cats: u.cats_allowed,
      small_dogs: u.small_dogs_allowed,
      large_dogs: u.large_dogs_allowed,
      caged_pets: u.caged_pets_allowed,
    },
    verified: u.is_verified,
    featured: Boolean(u.featured_at),
    latitude: u.latitude,
    longitude: u.longitude,
    photo: u.photos?.[0]?.src ?? u.photos?.[0]?.original ?? null,
    url: listingUrl(u.listing_id),
  };
}

export type CompactUnit = ReturnType<typeof compactUnit>;

export function compactListing(d: RawListingDetail, maxPhotos = 8) {
  return {
    listing_id: d.listingId,
    title: d.title,
    neighborhood: d.neighborhood,
    price: d.price,
    price_is_starting_from: d.fromPrice,
    availability: d.availability,
    lease_term: d.leaseTerm,
    description: d.bio,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    housemates: d.housemates,
    host_name: d.hostName,
    amenities: d.amenities ?? [],
    utilities: d.utilities ?? { included: [], notIncluded: [] },
    shared_spaces: d.sharedSpaces ?? [],
    bedroom_features: d.bedroom ?? [],
    house_rules: d.houseRules ?? { allowed: [], notAllowed: [] },
    rules: d.rules ?? [],
    rooms: (d.bedroomOptions ?? []).map((b) => ({
      bedroom_id: b.id,
      title: b.title,
      price_cad_per_month: toNumber(b.price),
      bed_type: b.bedType,
      bathroom: b.bathroomType,
      furnished: b.furnished,
      features: b.features ?? [],
      available_from: b.availableFrom ? b.availableFrom.slice(0, 10) : null,
      currently_listed: b.isPublished && b.isOpenToApplications && !b.isOccupied,
      occupied: b.isOccupied,
    })),
    latitude: d.latitude,
    longitude: d.longitude,
    photos: (d.photos ?? [])
      .map((p) => p.src || p.original)
      .filter((s): s is string => Boolean(s))
      .slice(0, maxPhotos),
    url: d.links?.listing ?? listingUrl(d.listingId),
  };
}

export function snakeBounds(b: Bounds) {
  return {
    north_west_latitude: b.northWestLatitude,
    north_west_longitude: b.northWestLongitude,
    south_east_latitude: b.southEastLatitude,
    south_east_longitude: b.southEastLongitude,
  };
}
