import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const wranglerConfig = JSON.parse(
  fs.readFileSync(
    path.resolve(import.meta.dirname, "../../wrangler.jsonc"),
    "utf8",
  ),
);

describe("web Pages wrangler config", () => {
  it("defaults preview deployments to the isolated preview API service", () => {
    expect(wranglerConfig.services).toEqual([
      {
        binding: "API",
        service: "kaisoumail-api-preview",
      },
    ]);
  });

  it("pins production deployments to the live API service", () => {
    expect(wranglerConfig.env?.production?.services).toEqual([
      {
        binding: "API",
        service: "kaisoumail-api",
      },
    ]);
  });
});
