import { count, eq, isNull } from "drizzle-orm";
import type { Database } from "../db/client";
import { apiKeys, domains, mailboxes, subdomains, users } from "../db/schema";
import type { RuntimeConfig } from "../env";
import { nowIso, randomId, sha256Hex } from "../lib/crypto";
import { normalizeRootDomain } from "../lib/email";

const resolveBootstrapUsername = (email: string) => {
  const localPart = email.split("@")[0] ?? "";
  const normalized = localPart
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return normalized || "owner";
};

export const ensureBootstrapAdmin = async (
  db: Database,
  config: RuntimeConfig,
) => {
  const existing = await db.select({ value: count() }).from(users);
  if ((existing[0]?.value ?? 0) > 0) return;
  if (config.BOOTSTRAP_ADMIN_INVITE_CODE) return;
  if (!config.BOOTSTRAP_ADMIN_EMAIL || !config.BOOTSTRAP_ADMIN_API_KEY) {
    return;
  }

  // Keep fresh deployments on older env bundles operable until they migrate to
  // the explicit bootstrap invite flow.
  const createdAt = nowIso();
  const userId = randomId("usr");
  const apiKey = config.BOOTSTRAP_ADMIN_API_KEY;
  const displayName =
    config.BOOTSTRAP_ADMIN_NAME?.trim() ||
    resolveBootstrapUsername(config.BOOTSTRAP_ADMIN_EMAIL);

  await db.insert(users).values({
    id: userId,
    email: config.BOOTSTRAP_ADMIN_EMAIL,
    name: displayName,
    username: resolveBootstrapUsername(config.BOOTSTRAP_ADMIN_EMAIL),
    nickname: displayName,
    role: "admin",
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
  });

  await db.insert(apiKeys).values({
    id: randomId("key"),
    userId,
    name: "Bootstrap Admin",
    prefix: apiKey.slice(0, 12),
    keyHash: await sha256Hex(apiKey),
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
      catchAllEnabled: false,
      lastProvisionError: null,
      lastProvisionedAt: null,
    };
  }

  if (zoneId) {
    return {
      status: "active" as const,
      catchAllEnabled: false,
      lastProvisionError: null,
      lastProvisionedAt: timestamp,
    };
  }

  return {
    status: "provisioning_error" as const,
    catchAllEnabled: false,
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
      bindingSource: "catalog",
      status: provisionState.status,
      catchAllEnabled: false,
      catchAllOwnerUserId: null,
      catchAllRestoreStateJson: null,
      catchAllUpdatedAt: null,
      subdomainDnsMode: "explicit",
      wildcardDnsVerifiedAt: null,
      wildcardDnsLastError: null,
      lastProvisionError: provisionState.lastProvisionError,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastProvisionedAt: provisionState.lastProvisionedAt,
      disabledAt: null,
      deletedAt: null,
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
