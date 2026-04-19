import { beforeEach, describe, expect, it, vi } from "vitest";

import { domains, mailboxes, subdomains } from "../db/schema";
import {
  ensureBootstrapDomains,
  resolveBootstrapLegacyDomainState,
} from "../services/bootstrap";

const timestamp = "2026-04-03T12:00:00.000Z";

const createBootstrapDb = (existingDomains: unknown[]) => {
  const updates: Array<{ table: unknown; values: Record<string, unknown> }> =
    [];

  return {
    updates,
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () =>
              table === domains ? existingDomains : [],
            ),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
      update: vi.fn((table: unknown) => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updates.push({ table, values });
          return {
            where: vi.fn(async () => undefined),
          };
        }),
      })),
    },
  };
};

describe("bootstrap legacy domain state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps legacy domains non-active until a zone id exists in live mode", () => {
    expect(
      resolveBootstrapLegacyDomainState(
        {
          APP_ENV: "production",
          MAIL_DOMAIN: "707979.xyz",
          DEFAULT_MAILBOX_TTL_MINUTES: 60,
          CLEANUP_BATCH_SIZE: 3,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
          EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
          SESSION_SECRET: "super-secret-session-key",
          BOOTSTRAP_ADMIN_NAME: "Ivan",
          CF_ROUTE_RULESET_TAG: "kaisoumail",
        },
        null,
        timestamp,
      ),
    ).toEqual({
      status: "provisioning_error",
      catchAllEnabled: false,
      lastProvisionError:
        "Legacy mailbox domain requires CLOUDFLARE_ZONE_ID before it can be activated",
      lastProvisionedAt: null,
    });
  });

  it("marks legacy domains active once a zone id is present", () => {
    expect(
      resolveBootstrapLegacyDomainState(
        {
          APP_ENV: "production",
          MAIL_DOMAIN: "707979.xyz",
          DEFAULT_MAILBOX_TTL_MINUTES: 60,
          CLEANUP_BATCH_SIZE: 3,
          SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
          SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
          EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
          SESSION_SECRET: "super-secret-session-key",
          BOOTSTRAP_ADMIN_NAME: "Ivan",
          CF_ROUTE_RULESET_TAG: "kaisoumail",
        },
        "zone_123",
        timestamp,
      ),
    ).toEqual({
      status: "active",
      catchAllEnabled: false,
      lastProvisionError: null,
      lastProvisionedAt: timestamp,
    });
  });

  it("preserves project-bound soft-delete metadata for existing legacy domains", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date(timestamp).valueOf());

    const { db, updates } = createBootstrapDb([
      {
        id: "dom_legacy",
        rootDomain: "707979.xyz",
        zoneId: "zone_existing",
        bindingSource: "project_bind",
        status: "disabled",
        catchAllEnabled: false,
        lastProvisionError: null,
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        lastProvisionedAt: "2026-04-01T00:00:00.000Z",
        disabledAt: "2026-04-02T00:00:00.000Z",
        deletedAt: "2026-04-02T00:00:00.000Z",
      },
    ]);

    await ensureBootstrapDomains(db as never, {
      APP_ENV: "production",
      MAIL_DOMAIN: "707979.xyz",
      DEFAULT_MAILBOX_TTL_MINUTES: 60,
      CLEANUP_BATCH_SIZE: 3,
      SUBDOMAIN_CLEANUP_BATCH_SIZE: 1,
      SUBDOMAIN_CLEANUP_REQUEST_BUDGET: 400,
      EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
      CLOUDFLARE_ZONE_ID: "zone_bootstrap",
      SESSION_SECRET: "super-secret-session-key",
      BOOTSTRAP_ADMIN_NAME: "Ivan",
      CF_ROUTE_RULESET_TAG: "kaisoumail",
    });

    const domainUpdate = updates.find((entry) => entry.table === domains);
    expect(domainUpdate?.values.zoneId).toBe("zone_existing");
    expect(domainUpdate?.values.bindingSource).not.toBe("catalog");
    expect(domainUpdate?.values.deletedAt).not.toBeNull();

    expect(updates.some((entry) => entry.table === subdomains)).toBe(true);
    expect(updates.some((entry) => entry.table === mailboxes)).toBe(true);
  });
});
