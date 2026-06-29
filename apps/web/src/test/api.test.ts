import { afterEach, describe, expect, it, vi } from "vitest";

import { apiClient, resolveApiBase } from "@/lib/api";

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

describe("passkey auth requests", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses credentialed fetch for passkey registration challenge and verify calls", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ challenge: "demo-challenge" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await apiClient.createPasskeyRegistrationCompletionOptions({
      token: "pending_token",
      nickname: "Ivan",
      inviteCode: "km_demo_invite",
      passkeyName: "Primary Passkey",
    });

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/auth/registration/passkey/options"),
      expect.objectContaining({
        credentials: "include",
      }),
    );

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          user: {
            id: "usr_1",
            username: "ivan",
            nickname: "Ivan",
            role: "member",
          },
          authenticatedAt: "2026-06-25T14:00:00.000Z",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await apiClient.verifyPasskeyRegistrationCompletion({
      id: "credential_demo",
    } as never);

    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/auth/registration/passkey/verify"),
      expect.objectContaining({
        credentials: "include",
      }),
    );
  });
});
