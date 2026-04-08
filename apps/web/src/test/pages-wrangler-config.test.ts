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
  it("keeps the Pages project name aligned with the deploy target", () => {
    expect(wranglerConfig.name).toBe("kaisoumail");
  });

  it("binds the same-origin proxy to the live API worker service", () => {
    expect(wranglerConfig.services).toEqual([
      {
        binding: "API",
        service: "kaisoumail-api",
      },
    ]);
  });
});
