import { describe, expect, it } from "vitest";

import { resolveBootstrapLegacyDomainState } from "../services/bootstrap";

const timestamp = "2026-04-03T12:00:00.000Z";

describe("bootstrap legacy domain state", () => {
  it("keeps legacy domains non-active until a zone id exists in live mode", () => {
    expect(
      resolveBootstrapLegacyDomainState(
        {
          APP_ENV: "production",
          MAIL_DOMAIN: "707979.xyz",
          DEFAULT_MAILBOX_TTL_MINUTES: 60,
          CLEANUP_BATCH_SIZE: 3,
          EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
          SESSION_SECRET: "super-secret-session-key",
          BOOTSTRAP_ADMIN_NAME: "Ivan",
          CF_ROUTE_RULESET_TAG: "cf-mail",
        },
        null,
        timestamp,
      ),
    ).toEqual({
      status: "provisioning_error",
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
          EMAIL_ROUTING_MANAGEMENT_ENABLED: true,
          SESSION_SECRET: "super-secret-session-key",
          BOOTSTRAP_ADMIN_NAME: "Ivan",
          CF_ROUTE_RULESET_TAG: "cf-mail",
        },
        "zone_123",
        timestamp,
      ),
    ).toEqual({
      status: "active",
      lastProvisionError: null,
      lastProvisionedAt: timestamp,
    });
  });
});
