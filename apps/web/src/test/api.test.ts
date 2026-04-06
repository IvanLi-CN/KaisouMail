import { describe, expect, it } from "vitest";

import { resolveApiBase } from "@/lib/api";

describe("api base resolution", () => {
  it("uses the matching API alias for km.707979.xyz", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.cfm.707979.xyz",
        currentLocation: { hostname: "km.707979.xyz" },
      }),
    ).toBe("https://api.km.707979.xyz");
  });

  it("uses the matching API alias for cfm.707979.xyz", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.km.707979.xyz",
        currentLocation: { hostname: "cfm.707979.xyz" },
      }),
    ).toBe("https://api.cfm.707979.xyz");
  });

  it("falls back to the configured API base for non-production hosts", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.cfm.707979.xyz/",
        currentLocation: { hostname: "localhost" },
      }),
    ).toBe("https://api.cfm.707979.xyz");
  });

  it("preserves relative configured API bases when no alias mapping applies", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "/proxy-api/",
        currentLocation: { hostname: "preview.707979.xyz" },
      }),
    ).toBe("/proxy-api");
  });
});
