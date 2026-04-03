import { domainCatalogItemSchema, domainSchema } from "@cf-mail/shared";
import { asc, eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { domains, type mailboxes } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso, randomId } from "../lib/crypto";
import {
  extractRootDomainFromAddress,
  normalizeRootDomain,
} from "../lib/email";
import { ApiError } from "../lib/errors";
import {
  type CloudflareZoneSummary,
  type EmailRoutingDomain,
  enableDomainRouting,
  listZones,
  validateZoneAccess,
} from "./emailRouting";

export type DomainRow = typeof domains.$inferSelect;
type MailboxDomainRef = Pick<
  typeof mailboxes.$inferSelect,
  "address" | "subdomain" | "domainId"
>;

const toDomainDto = (row: DomainRow) =>
  domainSchema.parse({
    id: row.id,
    rootDomain: row.rootDomain,
    zoneId: row.zoneId,
    status: row.status,
    lastProvisionError: row.lastProvisionError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastProvisionedAt: row.lastProvisionedAt,
    disabledAt: row.disabledAt,
  });

const toDomainCatalogDto = (input: {
  row: DomainRow | null;
  zone: CloudflareZoneSummary | null;
  rootDomain: string;
}) =>
  domainCatalogItemSchema.parse({
    id: input.row?.id ?? null,
    rootDomain: input.rootDomain,
    zoneId: input.zone?.id ?? input.row?.zoneId ?? null,
    cloudflareAvailability: input.zone ? "available" : "missing",
    projectStatus: input.row?.status ?? "not_enabled",
    lastProvisionError: input.row?.lastProvisionError ?? null,
    createdAt: input.row?.createdAt ?? null,
    updatedAt: input.row?.updatedAt ?? null,
    lastProvisionedAt: input.row?.lastProvisionedAt ?? null,
    disabledAt: input.row?.disabledAt ?? null,
  });

const orderByRootDomain = [asc(domains.rootDomain)] as const;

export const classifyDomainCreateState = (existing: DomainRow | null) => {
  if (!existing) {
    return {
      kind: "create" as const,
    };
  }

  if (existing.status === "active") {
    return {
      kind: "conflict" as const,
      row: existing,
    };
  }

  return {
    kind: "replace" as const,
    row: existing,
  };
};

const provisionDomain = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  if (!config.EMAIL_ROUTING_MANAGEMENT_ENABLED) {
    return {
      status: "active" as const,
      lastProvisionError: null,
      lastProvisionedAt: null,
    };
  }

  await validateZoneAccess(config, domain);
  await enableDomainRouting(config, domain);
  return {
    status: "active" as const,
    lastProvisionError: null,
    lastProvisionedAt: nowIso(),
  };
};

const listLocalDomainRows = async (env: WorkerEnv) => {
  const db = getDb(env);
  return db
    .select()
    .from(domains)
    .orderBy(...orderByRootDomain);
};

const listCloudflareZonesByRootDomain = async (config: RuntimeConfig) => {
  const zones = await listZones(config);
  return new Map(
    zones.map((zone) => [normalizeRootDomain(zone.name), zone] as const),
  );
};

const requireCatalogZone = async (
  config: RuntimeConfig,
  rootDomain: string,
  zoneId: string,
) => {
  if (!config.EMAIL_ROUTING_MANAGEMENT_ENABLED) return;

  const zonesByRootDomain = await listCloudflareZonesByRootDomain(config);
  const zone = zonesByRootDomain.get(rootDomain);
  if (!zone || zone.id !== zoneId) {
    throw new ApiError(400, "Mailbox domain is not available in Cloudflare", {
      rootDomain,
      zoneId,
    });
  }
};

export const listDomains = async (env: WorkerEnv) => {
  const rows = await listLocalDomainRows(env);
  return rows.map(toDomainDto);
};

export const listDomainCatalog = async (
  env: WorkerEnv,
  config: RuntimeConfig,
) => {
  const [rows, zonesByRootDomain] = await Promise.all([
    listLocalDomainRows(env),
    listCloudflareZonesByRootDomain(config),
  ]);
  const rowsByRootDomain = new Map(
    rows.map((row) => [row.rootDomain, row] as const),
  );
  const rootDomains = new Set([
    ...rowsByRootDomain.keys(),
    ...zonesByRootDomain.keys(),
  ]);

  return [...rootDomains]
    .sort((left, right) => left.localeCompare(right))
    .map((rootDomain) =>
      toDomainCatalogDto({
        row: rowsByRootDomain.get(rootDomain) ?? null,
        zone: zonesByRootDomain.get(rootDomain) ?? null,
        rootDomain,
      }),
    );
};

export const listActiveRootDomains = async (env: WorkerEnv) => {
  const db = getDb(env);
  const rows = await db
    .select({ rootDomain: domains.rootDomain })
    .from(domains)
    .where(eq(domains.status, "active"))
    .orderBy(...orderByRootDomain);

  return rows.map((row) => row.rootDomain);
};

export const getDomainById = async (env: WorkerEnv, domainId: string) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(domains)
    .where(eq(domains.id, domainId))
    .limit(1);
  return rows[0] ?? null;
};

export const getDomainByRootDomain = async (
  env: WorkerEnv,
  rootDomain: string,
) => {
  const db = getDb(env);
  const normalizedRootDomain = normalizeRootDomain(rootDomain);
  const rows = await db
    .select()
    .from(domains)
    .where(eq(domains.rootDomain, normalizedRootDomain))
    .limit(1);
  return rows[0] ?? null;
};

export const requireActiveDomainByRootDomain = async (
  env: WorkerEnv,
  rootDomain: string,
) => {
  const domain = await getDomainByRootDomain(env, rootDomain);
  if (!domain || domain.status !== "active") {
    throw new ApiError(400, "Mailbox domain is not enabled", {
      rootDomain: normalizeRootDomain(rootDomain),
    });
  }
  return domain;
};

export const pickRandomActiveDomain = async (env: WorkerEnv) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(domains)
    .where(eq(domains.status, "active"))
    .orderBy(...orderByRootDomain);

  if (rows.length === 0) {
    throw new ApiError(400, "No mailbox domains are enabled");
  }

  const index = Math.floor(Math.random() * rows.length);
  return rows[index] ?? rows[0];
};

export const createDomain = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  input: { rootDomain: string; zoneId: string },
) => {
  const db = getDb(env);
  const rootDomain = normalizeRootDomain(input.rootDomain);
  const zoneId = input.zoneId.trim();
  if (!zoneId) {
    throw new ApiError(400, "zoneId is required");
  }
  await requireCatalogZone(config, rootDomain, zoneId);

  const existing = await getDomainByRootDomain(env, rootDomain);
  const createState = classifyDomainCreateState(existing);
  if (createState.kind === "conflict") {
    throw new ApiError(409, "Mailbox domain already exists", {
      rootDomain,
    });
  }

  const updatedAt = nowIso();
  let status: DomainRow["status"] = "active";
  let lastProvisionError: string | null = null;
  let lastProvisionedAt: string | null = null;

  try {
    const provisioned = await provisionDomain(config, { rootDomain, zoneId });
    status = provisioned.status;
    lastProvisionError = provisioned.lastProvisionError;
    lastProvisionedAt = provisioned.lastProvisionedAt;
  } catch (error) {
    status = "provisioning_error";
    lastProvisionError =
      error instanceof Error ? error.message : "Failed to provision domain";
  }

  if (createState.kind === "replace") {
    const next: DomainRow = {
      ...createState.row,
      zoneId,
      status,
      lastProvisionError,
      updatedAt,
      lastProvisionedAt,
      disabledAt: null,
    };

    await db
      .update(domains)
      .set({
        zoneId: next.zoneId,
        status: next.status,
        lastProvisionError: next.lastProvisionError,
        updatedAt: next.updatedAt,
        lastProvisionedAt: next.lastProvisionedAt,
        disabledAt: next.disabledAt,
      })
      .where(eq(domains.id, next.id));

    return {
      domain: toDomainDto(next),
      created: false,
    };
  }

  const domain: DomainRow = {
    id: randomId("dom"),
    rootDomain,
    zoneId,
    status,
    lastProvisionError,
    createdAt: updatedAt,
    updatedAt,
    lastProvisionedAt,
    disabledAt: null,
  };

  await db.insert(domains).values(domain);
  return {
    domain: toDomainDto(domain),
    created: true,
  };
};

export const retryDomainProvision = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domainId: string,
) => {
  const db = getDb(env);
  const existing = await getDomainById(env, domainId);
  if (!existing) throw new ApiError(404, "Mailbox domain not found");
  if (existing.status === "disabled") {
    throw new ApiError(409, "Disabled mailbox domains cannot be retried");
  }

  const updatedAt = nowIso();
  let status: DomainRow["status"] = "active";
  let lastProvisionError: string | null = null;
  let lastProvisionedAt: string | null = existing.lastProvisionedAt;

  try {
    const provisioned = await provisionDomain(config, {
      rootDomain: existing.rootDomain,
      zoneId: existing.zoneId,
    });
    status = provisioned.status;
    lastProvisionError = provisioned.lastProvisionError;
    lastProvisionedAt = provisioned.lastProvisionedAt;
  } catch (error) {
    status = "provisioning_error";
    lastProvisionError =
      error instanceof Error ? error.message : "Failed to provision domain";
  }

  const next = {
    ...existing,
    status,
    lastProvisionError,
    updatedAt,
    lastProvisionedAt,
    disabledAt: null,
  };

  await db
    .update(domains)
    .set({
      status: next.status,
      lastProvisionError: next.lastProvisionError,
      updatedAt: next.updatedAt,
      lastProvisionedAt: next.lastProvisionedAt,
      disabledAt: next.disabledAt,
    })
    .where(eq(domains.id, existing.id));

  return toDomainDto(next);
};

export const disableDomain = async (env: WorkerEnv, domainId: string) => {
  const db = getDb(env);
  const existing = await getDomainById(env, domainId);
  if (!existing) throw new ApiError(404, "Mailbox domain not found");
  if (existing.status === "disabled") return toDomainDto(existing);

  const disabledAt = nowIso();
  const next = {
    ...existing,
    status: "disabled",
    disabledAt,
    updatedAt: disabledAt,
    lastProvisionError: existing.lastProvisionError,
  } satisfies DomainRow;

  await db
    .update(domains)
    .set({
      status: next.status,
      disabledAt: next.disabledAt,
      updatedAt: next.updatedAt,
    })
    .where(eq(domains.id, existing.id));

  return toDomainDto(next);
};

export const resolveMailboxDomain = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  mailbox: MailboxDomainRef,
) => {
  if (mailbox.domainId) {
    const byId = await getDomainById(env, mailbox.domainId);
    if (byId) return byId;
  }

  const extractedRootDomain = extractRootDomainFromAddress(
    mailbox.address,
    mailbox.subdomain,
  );
  if (!extractedRootDomain) return null;

  const byRootDomain = await getDomainByRootDomain(env, extractedRootDomain);
  if (byRootDomain) return byRootDomain;

  const legacyRootDomain = config.MAIL_DOMAIN
    ? normalizeRootDomain(config.MAIL_DOMAIN)
    : null;
  if (legacyRootDomain && extractedRootDomain === legacyRootDomain) {
    return {
      id: "legacy-domain",
      rootDomain: legacyRootDomain,
      zoneId: config.CLOUDFLARE_ZONE_ID ?? null,
      status: "active",
      lastProvisionError: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastProvisionedAt: null,
      disabledAt: null,
    } satisfies DomainRow;
  }

  return null;
};
