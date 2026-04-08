import { describe, expect, it } from "vitest";

import { resolveApiBase } from "@/lib/api";

describe("api base resolution", () => {
  it("uses an empty same-origin base so existing /api paths stay stable in browser environments", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.cfm.707979.xyz",
        currentLocation: { hostname: "km.707979.xyz" },
      }),
    ).toBe("");
  });

  it("falls back to the configured API base when same-origin routing is disabled", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.cfm.707979.xyz/",
        currentLocation: { hostname: "localhost" },
        preferSameOrigin: false,
      }),
    ).toBe("https://api.cfm.707979.xyz");
  });

  it("preserves relative configured API bases for explicit non-browser overrides", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "/proxy-api/",
        currentLocation: { hostname: "preview.707979.xyz" },
        preferSameOrigin: false,
      }),
    ).toBe("/proxy-api");
  });
});
