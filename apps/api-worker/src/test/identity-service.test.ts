import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RuntimeConfig } from "../env";

const { getDb } = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("../db/client", () => ({
  getDb,
}));

import {
  getRegistrationSettings,
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

describe("identity service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves runtime OAuth secrets when admins save blank secret fields", async () => {
    const persistedUpdates: unknown[] = [];
    getDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [currentSettingsRow],
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
        githubClientSecret: "env-github-secret",
        linuxdoClientSecret: "env-linuxdo-secret",
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
});
