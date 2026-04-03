import { count, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { apiKeys, domains, mailboxes, subdomains, users } from "../db/schema";
import type { RuntimeConfig } from "../env";
import { nowIso, randomId, sha256Hex } from "../lib/crypto";
import { normalizeRootDomain } from "../lib/email";

export const ensureBootstrapAdmin = async (
  db: Database,
  config: RuntimeConfig,
) => {
  const existing = await db.select({ value: count() }).from(users);
  if ((existing[0]?.value ?? 0) > 0) return;
  if (!config.BOOTSTRAP_ADMIN_EMAIL || !config.BOOTSTRAP_ADMIN_API_KEY) return;

  const userId = randomId("usr");
  const apiKeyId = randomId("key");
  const createdAt = nowIso();
  const keyHash = await sha256Hex(config.BOOTSTRAP_ADMIN_API_KEY);
  const prefix = config.BOOTSTRAP_ADMIN_API_KEY.slice(0, 12);

  await db.insert(users).values({
    id: userId,
    email: config.BOOTSTRAP_ADMIN_EMAIL,
    name: config.BOOTSTRAP_ADMIN_NAME,
    role: "admin",
    createdAt,
    updatedAt: createdAt,
  });

  await db.insert(apiKeys).values({
    id: apiKeyId,
    userId,
    name: "Bootstrap Admin",
    prefix,
    keyHash,
    scopes: JSON.stringify(["*"]),
    createdAt,
    lastUsedAt: null,
    revokedAt: null,
  });
};

export const resolveBootstrapLegacyDomainState = (
  config: RuntimeConfig,
  zoneId: string | null,
  timestamp: string,
) => {
  if (!config.EMAIL_ROUTING_MANAGEMENT_ENABLED) {
    return {
      status: "active" as const,
      lastProvisionError: null,
      lastProvisionedAt: null,
    };
  }

  if (zoneId) {
    return {
      status: "active" as const,
      lastProvisionError: null,
      lastProvisionedAt: timestamp,
    };
  }

  return {
    status: "provisioning_error" as const,
    lastProvisionError:
      "Legacy mailbox domain requires CLOUDFLARE_ZONE_ID before it can be activated",
    lastProvisionedAt: null,
  };
};

export const ensureBootstrapDomains = async (
  db: Database,
  config: RuntimeConfig,
) => {
  const legacyRootDomain = config.MAIL_DOMAIN
    ? normalizeRootDomain(config.MAIL_DOMAIN)
    : null;
  if (!legacyRootDomain) return;

  const existing = await db
    .select()
    .from(domains)
    .where(eq(domains.rootDomain, legacyRootDomain))
    .limit(1);

  const timestamp = nowIso();
  const zoneId = config.CLOUDFLARE_ZONE_ID ?? null;
  const nextZoneId = existing[0]?.zoneId ?? zoneId;
  const provisionState = resolveBootstrapLegacyDomainState(
    config,
    nextZoneId,
    timestamp,
  );
  const domain =
    existing[0] ??
    ({
      id: randomId("dom"),
      rootDomain: legacyRootDomain,
      zoneId: nextZoneId,
      status: provisionState.status,
      lastProvisionError: provisionState.lastProvisionError,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastProvisionedAt: provisionState.lastProvisionedAt,
      disabledAt: null,
    } as const);

  if (!existing[0]) {
    await db.insert(domains).values(domain);
  } else {
    const shouldRefreshProvisionState =
      existing[0].status !== "disabled" &&
      (existing[0].zoneId !== nextZoneId ||
        existing[0].status !== provisionState.status ||
        existing[0].lastProvisionError !== provisionState.lastProvisionError ||
        existing[0].lastProvisionedAt !== provisionState.lastProvisionedAt);

    await db
      .update(domains)
      .set({
        zoneId: nextZoneId,
        updatedAt: timestamp,
        ...(shouldRefreshProvisionState
          ? {
              status: provisionState.status,
              lastProvisionError: provisionState.lastProvisionError,
              lastProvisionedAt: provisionState.lastProvisionedAt,
            }
          : {}),
      })
      .where(eq(domains.id, existing[0].id));
  }

  await db
    .update(subdomains)
    .set({ domainId: domain.id })
    .where(isNull(subdomains.domainId));
  await db
    .update(mailboxes)
    .set({ domainId: domain.id })
    .where(isNull(mailboxes.domainId));
};
