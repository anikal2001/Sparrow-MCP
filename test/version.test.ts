import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { PACKAGE_NAME, VERSION } from "../src/version.js";

it("src/version.ts matches package.json", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  expect({ PACKAGE_NAME, VERSION }).toEqual({ PACKAGE_NAME: pkg.name, VERSION: pkg.version });
});
