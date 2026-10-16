import { z } from "zod";
import { fmt } from "../common/fmt.js";
import type { RegistrationContext } from "../common/registration.js";
import { PROMPTS, TOOLS } from "../types/sparrow.types.js";

/** A guided search users can pick from a client's prompt menu instead of typing the request. */
export function registerPrompts(ctx: RegistrationContext) {
  ctx.registerPrompt(
    PROMPTS.find_a_room,
    {
      title: "Find a room on Sparrow",
      description: "Walk through what you need (city, budget, move-in date, pets) and search Sparrow for matching rooms.",
      argsSchema: {
        city: z.string().describe('City or neighbourhood, e.g. "Toronto" or "Kitsilano, Vancouver"'),
        budget: z.string().optional().describe("Maximum monthly rent in CAD"),
        move_in: z.string().optional().describe("When you want to move in, e.g. 2026-12-01 or 'early December'"),
        needs: z.string().optional().describe("Anything else: pets, private bathroom, short lease, overnight guests..."),
      },
    },
    ({ city, budget, move_in, needs }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: fmt.trim(`
              I'm looking for a room to rent in ${city}.
              ${budget ? `My budget is up to $${budget.replace(/[^0-9.]/g, "") || budget} CAD a month.` : ""}
              ${move_in ? `I want to move in around ${move_in}.` : ""}
              ${needs ? `Other needs: ${needs}.` : ""}

              Use ${TOOLS.search_rooms} to find matches, applying only the filters I mentioned.
              If nothing matches, say which filter is most likely ruling rooms out and offer to relax it.
              Show the best five with price, availability and the listing url, and offer ${TOOLS.get_listing_details} for any I want to know more about.
            `).replace(/\n{2,}/g, "\n\n"),
          },
        },
      ],
    }),
  );
}
