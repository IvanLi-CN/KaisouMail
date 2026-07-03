import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../env";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

import {
  consumeDailyOpenRegistration,
  getRegistrationSettings,
  registerViaExternalProvider,
  registerViaPasskeyInvite,
  resolveExternalRegistrationRequirement,
  resolveStoredOauthConfig,
  updateRegistrationSettings,
} from "../services/identity";

const baseConfig = {
  APP_ENV: "development",
  DEFAULT_MAILBOX_TTL_MINUTES: 60,
  CLEANUP_BATCH_SIZE: 3,
  SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
  EMAIL_ROUTING_MANAGEMENT_ENABLED: false,
  BOOTSTRAP_ADMIN_NAME: "Owner",
  SESSION_SECRET: "super-secret-session-key",
  CF_ROUTE_RULESET_TAG: "kaisoumail",
  GITHUB_CLIENT_SECRET: "env-github-secret",
  LINUXDO_CLIENT_SECRET: "env-linuxdo-secret",
} satisfies RuntimeConfig;

const currentSettingsRow = {
  id: 1,
  githubMode: "open" as const,
  githubDailyLimit: 5,
  githubClientId: "stored-github-client-id",
  githubClientSecret: "",
  githubOauthScopes: "read:user user:email",
  linuxdoMode: "invite-only" as const,
  linuxdoDailyLimit: 3,
  linuxdoClientId: "stored-linuxdo-client-id",
  linuxdoClientSecret: "",
  linuxdoOauthBaseUrl: "https://connect.linux.do",
  passkeyMode: "invite-only" as const,
  deletedUserMailboxRetentionDays: 7,
  updatedAt: "2026-04-05T16:00:00.000Z",
};

const tableNameOf = (table: Record<PropertyKey, unknown>) =>
  String(table[Symbol.for("drizzle:Name")]);

const createSelectMock = (handlers: Record<string, unknown>) => {
  return (...args: unknown[]) => {
    const mode = args.length > 0 ? "aggregate" : "regular";
    return {
      from: (table: Record<PropertyKey, unknown>) => {
        const handler = handlers[tableNameOf(table)];
        if (typeof handler === "function") {
          return (handler as (mode: "aggregate" | "regular") => unknown)(mode);
        }
        return handler ?? [];
      },
    };
  };
};

describe("identity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not persist runtime OAuth secrets when admins save blank secret fields", async () => {
    const persistedUpdates: unknown[] = [];
    const update = vi.fn(() => ({
      set: (values: unknown) => ({
        where: async () => {
          persistedUpdates.push(values);
        },
      }),
    }));
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [currentSettingsRow],
          }),
        }),
      }),
      update,
    });

    await updateRegistrationSettings({} as never, baseConfig, {
      githubMode: "open",
      githubDailyLimit: 8,
      githubClientId: "stored-github-client-id",
      githubClientSecret: "",
      clearGithubClientSecret: false,
      githubOauthScopes: "read:user",
      linuxdoMode: "open",
      linuxdoDailyLimit: 4,
      linuxdoClientId: "stored-linuxdo-client-id",
      linuxdoClientSecret: "",
      clearLinuxdoClientSecret: false,
      linuxdoOauthBaseUrl: "https://connect.linux.do",
      passkeyMode: "invite-only",
      deletedUserMailboxRetentionDays: 9,
    });

    expect(persistedUpdates).toHaveLength(1);
    expect(persistedUpdates[0]).toEqual(
      expect.objectContaining({
        githubClientSecret: "",
        linuxdoClientSecret: "",
      }),
    );
    expect(persistedUpdates[0]).not.toHaveProperty("clearGithubClientSecret");
    expect(persistedUpdates[0]).not.toHaveProperty("clearLinuxdoClientSecret");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]).toHaveLength(1);
  });

  it("clears stored OAuth secrets when admins explicitly request removal", async () => {
    const persistedUpdates: unknown[] = [];
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                ...currentSettingsRow,
                githubClientSecret: "stored-secret",
                linuxdoClientSecret: "stored-linuxdo-secret",
              },
            ],
          }),
        }),
      }),
      update: () => ({
        set: (values: unknown) => ({
          where: async () => {
            persistedUpdates.push(values);
          },
        }),
      }),
      insert: vi.fn(),
    });

    await updateRegistrationSettings({} as never, baseConfig, {
      githubMode: "open",
      githubDailyLimit: 8,
      githubClientId: "stored-github-client-id",
      githubClientSecret: "",
      clearGithubClientSecret: true,
      githubOauthScopes: "read:user",
      linuxdoMode: "open",
      linuxdoDailyLimit: 4,
      linuxdoClientId: "stored-linuxdo-client-id",
      linuxdoClientSecret: "",
      clearLinuxdoClientSecret: true,
      linuxdoOauthBaseUrl: "https://connect.linux.do",
      passkeyMode: "invite-only",
      deletedUserMailboxRetentionDays: 9,
    });

    expect(persistedUpdates[0]).toEqual(
      expect.objectContaining({
        githubClientSecret: "",
        linuxdoClientSecret: "",
      }),
    );
    expect(persistedUpdates[0]).not.toHaveProperty("clearGithubClientSecret");
    expect(persistedUpdates[0]).not.toHaveProperty("clearLinuxdoClientSecret");
  });

  it("lets runtime LinuxDO OAuth base URL override the stored default", () => {
    expect(
      resolveStoredOauthConfig(currentSettingsRow, {
        ...baseConfig,
        LINUXDO_OAUTH_BASE_URL: "https://linuxdo-oauth.example.test",
      }).linuxdoOauthBaseUrl,
    ).toBe("https://linuxdo-oauth.example.test");

    expect(
      resolveStoredOauthConfig(
        {
          ...currentSettingsRow,
          linuxdoOauthBaseUrl: "https://stored-linuxdo.example.test",
        },
        baseConfig,
      ).linuxdoOauthBaseUrl,
    ).toBe("https://stored-linuxdo.example.test");
  });

  it("does not persist runtime-only LinuxDO OAuth issuer overrides", async () => {
    const persistedUpdates: unknown[] = [];
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                ...currentSettingsRow,
                linuxdoOauthBaseUrl: "https://stored-linuxdo.example.test",
              },
            ],
          }),
        }),
      }),
      update: () => ({
        set: (values: unknown) => ({
          where: async () => {
            persistedUpdates.push(values);
          },
        }),
      }),
      insert: vi.fn(),
    });

    await updateRegistrationSettings(
      {} as never,
      {
        ...baseConfig,
        LINUXDO_OAUTH_BASE_URL: "https://runtime-linuxdo.example.test",
      },
      {
        githubMode: "open",
        githubDailyLimit: 8,
        githubClientId: "stored-github-client-id",
        githubClientSecret: "",
        clearGithubClientSecret: false,
        githubOauthScopes: "read:user",
        linuxdoMode: "open",
        linuxdoDailyLimit: 4,
        linuxdoClientId: "stored-linuxdo-client-id",
        linuxdoClientSecret: "",
        clearLinuxdoClientSecret: false,
        linuxdoOauthBaseUrl: "https://runtime-linuxdo.example.test",
        passkeyMode: "invite-only",
        deletedUserMailboxRetentionDays: 9,
      },
    );

    expect(persistedUpdates[0]).toEqual(
      expect.objectContaining({
        linuxdoOauthBaseUrl: "https://stored-linuxdo.example.test",
      }),
    );
  });

  it("keeps secret fields blank in the admin-facing registration settings payload", async () => {
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                ...currentSettingsRow,
                githubClientSecret: "stored-secret",
                linuxdoClientSecret: "stored-linuxdo-secret",
              },
            ],
          }),
        }),
      }),
    });

    const settings = await getRegistrationSettings({} as never, baseConfig);

    expect(settings.githubClientSecret).toBe("");
    expect(settings.linuxdoClientSecret).toBe("");
  });

  it("rejects invite-based external registration when the provider mode is off", async () => {
    getDb.mockReturnValue({
      select: createSelectMock({
        users: [{ value: 1 }],
        invites: {
          where: () => ({
            limit: async () => [
              {
                id: "inv_1",
                code: "km_demo_invite",
                role: "member",
                usedAt: null,
              },
            ],
          }),
        },
        registration_settings: {
          where: () => ({
            limit: async () => [
              {
                ...currentSettingsRow,
                githubMode: "off",
              },
            ],
          }),
        },
      }),
      insert: () => ({
        values: async () => undefined,
      }),
    });

    await expect(
      resolveExternalRegistrationRequirement(
        {} as never,
        "github",
        "km_demo_invite",
      ),
    ).rejects.toMatchObject({
      message: "Registration is disabled",
      status: 403,
    });
  });

  it("rejects external registration completion without an invite in invite-only mode", async () => {
    getDb.mockReturnValue({
      select: (...args: unknown[]) => ({
        from: (table: Record<PropertyKey, unknown>) => {
          const tableName = tableNameOf(table);
          if (tableName === "external_accounts") {
            return {
              innerJoin: () => ({
                where: () => ({
                  limit: async () => [],
                }),
              }),
              where: () => ({
                limit: async () => [],
              }),
            };
          }
          if (tableName === "users") {
            if (
              args.length > 0 &&
              typeof args[0] === "object" &&
              args[0] &&
              "value" in (args[0] as Record<string, unknown>)
            ) {
              return [{ value: 1 }];
            }
            return {
              where: () => ({
                limit: async () => [],
              }),
            };
          }
          if (tableName === "registration_settings") {
            return {
              where: () => ({
                limit: async () => [
                  {
                    ...currentSettingsRow,
                    githubMode: "invite-only",
                  },
                ],
              }),
            };
          }
          return [];
        },
      }),
      insert: () => ({
        values: async () => undefined,
      }),
    });

    await expect(
      registerViaExternalProvider(
        {} as never,
        "github",
        {
          provider: "github",
          providerUserId: "gh_123",
          providerUsername: "octo",
          providerNickname: "Octo Cat",
        },
        {
          nickname: "Octo Cat",
        },
      ),
    ).rejects.toMatchObject({
      message: "Invite required",
      status: 403,
    });
  });

  it("raises quota errors before any later registration work can proceed", async () => {
    getDb.mockReturnValue({
      select: createSelectMock({
        users: [{ value: 1 }],
        registration_settings: {
          where: () => ({
            limit: async () => [
              {
                ...currentSettingsRow,
                githubMode: "open",
                githubDailyLimit: 5,
              },
            ],
          }),
        },
      }),
    });
    const prepare = vi.fn(() => ({
      bind: vi.fn(() => ({
        run: vi.fn(async () => ({ meta: { changes: 0 } })),
      })),
    }));

    await expect(
      consumeDailyOpenRegistration({ DB: { prepare } } as never, "github"),
    ).rejects.toMatchObject({
      message: "Daily signup quota exceeded",
      status: 429,
    });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("consumes open-registration quota atomically through a conditional upsert", async () => {
    getDb.mockReturnValue({
      select: createSelectMock({
        registration_settings: {
          where: () => ({
            limit: async () => [
              {
                ...currentSettingsRow,
                githubMode: "open",
                githubDailyLimit: 5,
              },
            ],
          }),
        },
      }),
    });
    const run = vi.fn(async () => ({ meta: { changes: 1 } }));
    const bind = vi.fn(
      (..._args: unknown[]) =>
        ({
          run,
        }) as const,
    );
    const prepare = vi.fn(
      (_statement: string) =>
        ({
          bind,
        }) as const,
    );

    await expect(
      consumeDailyOpenRegistration({ DB: { prepare } } as never, "github"),
    ).resolves.toBeUndefined();

    const quotaStatement = prepare.mock.calls.at(0)?.[0] ?? "";
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(quotaStatement).toContain(
      "ON CONFLICT(provider, date_key) DO UPDATE",
    );
    expect(quotaStatement).toContain(
      "WHERE daily_signup_counters.created_count < ?",
    );
    expect(bind).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("rolls back the newly created user when invite claiming loses a race", async () => {
    const deletedUserIds: string[] = [];
    getDb.mockReturnValue({
      select: (...args: unknown[]) => ({
        from: (table: Record<PropertyKey, unknown>) => {
          const tableName = tableNameOf(table);
          if (tableName === "users") {
            if (
              args.length > 0 &&
              typeof args[0] === "object" &&
              args[0] &&
              "value" in (args[0] as Record<string, unknown>)
            ) {
              return [{ value: 2 }];
            }
            return {
              where: () => ({
                limit: async () => [],
              }),
            };
          }
          if (tableName === "invites") {
            return {
              where: () => ({
                limit: async () => [
                  {
                    id: "inv_race",
                    code: "km_demo_invite",
                    role: "member",
                    usedAt: null,
                  },
                ],
              }),
            };
          }
          if (tableName === "registration_settings") {
            return {
              where: () => ({
                limit: async () => [currentSettingsRow],
              }),
            };
          }
          if (tableName === "external_accounts") {
            return {
              where: () => ({
                limit: async () => [],
              }),
            };
          }
          return [];
        },
      }),
      insert: (_table: Record<PropertyKey, unknown>) => ({
        values: async (_value: unknown) => undefined,
      }),
      update: (table: Record<PropertyKey, unknown>) => ({
        set: (_values: unknown) => ({
          where: async () => {
            if (tableNameOf(table) === "invites") {
              return { meta: { changes: 0 } };
            }
            return { meta: { changes: 1 } };
          },
        }),
      }),
      delete: (table: Record<PropertyKey, unknown>) => ({
        where: async (_predicate: unknown) => {
          if (tableNameOf(table) === "users") {
            deletedUserIds.push("deleted");
          }
        },
      }),
    });

    await expect(
      registerViaPasskeyInvite({} as never, "km_demo_invite", "Octo"),
    ).rejects.toMatchObject({
      message: "Invite already used",
      status: 409,
    });

    expect(deletedUserIds).toHaveLength(1);
  });
});
