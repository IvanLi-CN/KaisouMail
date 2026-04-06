import { describe, expect, it } from "vitest";

import { resolveApiBase } from "@/lib/api";

describe("api base resolution", () => {
  it("defaults to the same-origin /api path for browser hosts", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.cfm.707979.xyz",
        currentLocation: { hostname: "km.707979.xyz" },
      }),
    ).toBe("/api");

    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.km.707979.xyz",
        currentLocation: { hostname: "cfm.707979.xyz" },
      }),
    ).toBe("/api");
  });

  it("ignores configured production aliases while same-origin mode is active", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.cfm.707979.xyz/",
        currentLocation: { hostname: "preview.707979.xyz" },
      }),
    ).toBe("/api");
  });

  it("keeps explicit API base overrides for non-browser callers", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "https://api.km.707979.xyz/",
        currentLocation: undefined,
        preferSameOrigin: false,
      }),
    ).toBe("https://api.km.707979.xyz");
  });

  it("preserves relative configured API bases when same-origin mode is disabled", () => {
    expect(
      resolveApiBase({
        configuredBaseUrl: "/proxy-api/",
        currentLocation: undefined,
        preferSameOrigin: false,
      }),
    ).toBe("/proxy-api");
  });
});
