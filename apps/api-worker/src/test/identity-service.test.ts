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
  githubMode: "open",
  githubDailyLimit: 5,
  githubClientId: "stored-github-client-id",
  githubClientSecret: "",
  githubOauthScopes: "read:user user:email",
  linuxdoMode: "invite-only",
  linuxdoDailyLimit: 3,
  linuxdoClientId: "stored-linuxdo-client-id",
  linuxdoClientSecret: "",
  linuxdoOauthBaseUrl: "https://connect.linux.do",
  passkeyMode: "invite-only",
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
      githubOauthScopes: "read:user",
      linuxdoMode: "open",
      linuxdoDailyLimit: 4,
      linuxdoClientId: "stored-linuxdo-client-id",
      linuxdoClientSecret: "",
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
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]).toHaveLength(1);
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
        daily_signup_counters: {
          where: () => ({
            limit: async () => [
              {
                id: "dsc_1",
                provider: "github",
                dateKey: "2026-06-25",
                createdCount: 5,
              },
            ],
          }),
        },
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
      insert: () => ({
        values: async () => undefined,
      }),
    });

    await expect(
      consumeDailyOpenRegistration({} as never, "github"),
    ).rejects.toMatchObject({
      message: "Daily signup quota exceeded",
      status: 429,
    });
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
