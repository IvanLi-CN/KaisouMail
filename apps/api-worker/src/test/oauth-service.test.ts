import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../env";
import {
  buildProviderStartUrl,
  completeProviderCallback,
} from "../services/oauth";

const {
  findUserByExternalAccount,
  consumeInviteForAuthenticatedUser,
  markExternalAccountUsed,
  getRegistrationSettings,
  resolveStoredOauthConfig,
} = vi.hoisted(() => ({
  findUserByExternalAccount: vi.fn(),
  consumeInviteForAuthenticatedUser: vi.fn(),
  markExternalAccountUsed: vi.fn(),
  getRegistrationSettings: vi.fn(),
  resolveStoredOauthConfig: vi.fn(),
}));

vi.mock("../services/identity", async () => {
  const actual = await vi.importActual<typeof import("../services/identity")>(
    "../services/identity",
  );
  return {
    ...actual,
    findUserByExternalAccount,
    consumeInviteForAuthenticatedUser,
    markExternalAccountUsed,
    getRegistrationSettings,
    resolveStoredOauthConfig,
  };
});

const baseConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: false,
  BOOTSTRAP_ADMIN_NAME: "Owner",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
  GITHUB_CLIENT_ID: "github-client-id",
  GITHUB_CLIENT_SECRET: "github-client-secret",
  GITHUB_OAUTH_SCOPES: ["read:user"],
  LINUXDO_CLIENT_ID: "linuxdo-client-id",
  LINUXDO_CLIENT_SECRET: "linuxdo-client-secret",
  LINUXDO_OAUTH_BASE_URL: "https://connect.linux.do",
} satisfies RuntimeConfig;

const existingUser = {
  id: "usr_existing",
  username: "existing",
  nickname: "Existing User",
  role: "member",
  deletedAt: null,
  externalAccountId: "ext_existing",
};

const createOauthState = async (intent: "login" | "register") => {
  const startUrl = await buildProviderStartUrl(
    baseConfig,
    new Request("https://api.example.test/api/auth/github/start"),
    {} as never,
    "github",
    {
      intent,
      inviteCode: "km_demo_invite",
      returnTo: intent === "register" ? "/register" : "/login",
    },
  );
  const parsed = new URL(startUrl);
  const state = parsed.searchParams.get("state");
  if (!state) {
    throw new Error("Missing oauth state");
  }
  return state;
};

describe("oauth service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRegistrationSettings.mockResolvedValue({
      githubMode: "open",
      githubDailyLimit: 5,
      githubClientId: "",
      githubClientSecret: "",
      githubOauthScopes: "read:user",
      linuxdoMode: "invite-only",
      linuxdoDailyLimit: 3,
      linuxdoClientId: "",
      linuxdoClientSecret: "",
      linuxdoOauthBaseUrl: "https://connect.linux.do",
      passkeyMode: "invite-only",
      deletedUserMailboxRetentionDays: 7,
      updatedAt: "2026-04-05T16:00:00.000Z",
    });
    resolveStoredOauthConfig.mockReturnValue({
      githubClientId: "github-client-id",
      githubClientSecret: "github-client-secret",
      githubOauthScopes: "read:user",
      linuxdoClientId: "linuxdo-client-id",
      linuxdoClientSecret: "linuxdo-client-secret",
      linuxdoOauthBaseUrl: "https://connect.linux.do",
    });
    findUserByExternalAccount.mockResolvedValue(existingUser);
    markExternalAccountUsed.mockResolvedValue(undefined);
    consumeInviteForAuthenticatedUser.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/access_token")) {
          return new Response(JSON.stringify({ access_token: "token_123" }), {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          });
        }
        return new Response(
          JSON.stringify({
            id: 12345,
            login: "existing-user",
            name: "Existing User",
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        );
      }),
    );
  });

  it("consumes an invite when a bound user returns through the register intent", async () => {
    const state = await createOauthState("register");

    const result = await completeProviderCallback(
      {} as never,
      baseConfig,
      new Request("https://api.example.test/api/auth/github/callback"),
      "github",
      new URLSearchParams({
        code: "oauth_code",
        state,
      }),
    );

    expect(consumeInviteForAuthenticatedUser).toHaveBeenCalledWith(
      {} as never,
      "usr_existing",
      "km_demo_invite",
    );
    expect(markExternalAccountUsed).toHaveBeenCalledWith(
      {} as never,
      "ext_existing",
    );
    expect(result.redirectTo).toBe("/register");
    expect(result.user).toMatchObject({
      id: "usr_existing",
      username: "existing",
    });
  });

  it("does not consume an invite when a bound user logs in through the login intent", async () => {
    const state = await createOauthState("login");

    const result = await completeProviderCallback(
      {} as never,
      baseConfig,
      new Request("https://api.example.test/api/auth/github/callback"),
      "github",
      new URLSearchParams({
        code: "oauth_code",
        state,
      }),
    );

    expect(consumeInviteForAuthenticatedUser).not.toHaveBeenCalled();
    expect(markExternalAccountUsed).toHaveBeenCalledWith(
      {} as never,
      "ext_existing",
    );
    expect(result.redirectTo).toBe("/workspace");
    expect(result.user).toMatchObject({
      id: "usr_existing",
      username: "existing",
    });
  });
});
