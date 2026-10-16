import { getListingDetail, listCities } from "../api/sparrow.api.js";
import { fmt } from "../common/fmt.js";
import type { RegistrationContext } from "../common/registration.js";
import { compactListing } from "../format.js";
import { GetListingInput, ListCitiesOutput, ListingDetailOutput, TOOLS } from "../types/sparrow.types.js";

export function registerListingTools(ctx: RegistrationContext) {
  ctx.registerTool(
    TOOLS.get_listing_details,
    {
      title: "Get Sparrow listing details",
      description: fmt.oneLine(`
        Fetch the full details of one Sparrow listing by listing_id (from search_rooms): description, amenities, utilities, shared spaces,
        house rules, host name, lease term, every room in the home with its price and availability, photos, and the public URL.
      `),
      inputSchema: GetListingInput,
      outputSchema: ListingDetailOutput,
    },
    async ({ listing_id }) => compactListing(await getListingDetail(listing_id)),
  );

  ctx.registerTool(
    TOOLS.list_cities,
    {
      title: "List cities with Sparrow rooms",
      description: fmt.oneLine(`
        List the cities where Sparrow currently has rooms listed.
        Useful to check coverage before searching or when the user has not named a city.
      `),
      inputSchema: {},
      outputSchema: ListCitiesOutput,
    },
    async () => {
      const cities = await listCities();
      return { cities: cities.map((c) => ({ city: c.city, province: c.province_code, label: c.label })) };
    },
  );
}
