import { domainCatalogItemSchema, domainSchema } from "@kaisoumail/shared";
import { and, asc, eq, isNull, ne } from "drizzle-orm";

import { getDb } from "../db/client";
import { domains, mailboxes, subdomains } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso, randomId } from "../lib/crypto";
import {
  extractRootDomainFromAddress,
  normalizeRootDomain,
} from "../lib/email";
import { ApiError } from "../lib/errors";
import {
  type CloudflareZoneSummary,
  createZone,
  deleteZone,
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
type DomainBindingSource = DomainRow["bindingSource"];

const toDomainDto = (row: DomainRow) =>
  domainSchema.parse({
    id: row.id,
    rootDomain: row.rootDomain,
    zoneId: row.zoneId,
    bindingSource: row.bindingSource,
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
    bindingSource: input.row?.bindingSource ?? null,
    cloudflareAvailability: input.zone ? "available" : "missing",
    cloudflareStatus: input.zone?.status ?? null,
    nameServers: input.zone?.nameServers ?? [],
    projectStatus: input.row?.status ?? "not_enabled",
    lastProvisionError: input.row?.lastProvisionError ?? null,
    createdAt: input.row?.createdAt ?? null,
    updatedAt: input.row?.updatedAt ?? null,
    lastProvisionedAt: input.row?.lastProvisionedAt ?? null,
    disabledAt: input.row?.disabledAt ?? null,
  });

const orderByRootDomain = [asc(domains.rootDomain)] as const;

const domainNotDeletedFilter = isNull(domains.deletedAt);

export const classifyDomainCreateState = (existing: DomainRow | null) => {
  if (!existing) {
    return {
      kind: "create" as const,
    };
  }

  if (!existing.deletedAt && existing.status === "active") {
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
    .where(domainNotDeletedFilter)
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

const persistManagedDomain = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  input: {
    rootDomain: string;
    zoneId: string;
    bindingSource: DomainBindingSource;
  },
) => {
  const db = getDb(env);
  const existing = await getDomainByRootDomain(env, input.rootDomain, {
    includeDeleted: true,
  });
  const createState = classifyDomainCreateState(existing);
  if (createState.kind === "conflict") {
    throw new ApiError(409, "Mailbox domain already exists", {
      rootDomain: input.rootDomain,
    });
  }

  const updatedAt = nowIso();
  let status: DomainRow["status"] = "active";
  let lastProvisionError: string | null = null;
  let lastProvisionedAt: string | null = null;

  try {
    const provisioned = await provisionDomain(config, {
      rootDomain: input.rootDomain,
      zoneId: input.zoneId,
    });
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
      zoneId: input.zoneId,
      bindingSource: input.bindingSource,
      status,
      lastProvisionError,
      updatedAt,
      lastProvisionedAt,
      disabledAt: null,
      deletedAt: null,
    };

    await db
      .update(domains)
      .set({
        zoneId: next.zoneId,
        bindingSource: next.bindingSource,
        status: next.status,
        lastProvisionError: next.lastProvisionError,
        updatedAt: next.updatedAt,
        lastProvisionedAt: next.lastProvisionedAt,
        disabledAt: next.disabledAt,
        deletedAt: next.deletedAt,
      })
      .where(eq(domains.id, next.id));

    return {
      domain: toDomainDto(next),
      created: false,
    };
  }

  const domain: DomainRow = {
    id: existing?.id ?? randomId("dom"),
    rootDomain: input.rootDomain,
    zoneId: input.zoneId,
    bindingSource: input.bindingSource,
    status,
    lastProvisionError,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    lastProvisionedAt,
    disabledAt: null,
    deletedAt: null,
  };

  await db.insert(domains).values(domain);
  return {
    domain: toDomainDto(domain),
    created: true,
  };
};

const requireDomainDeleteAllowed = async (
  env: WorkerEnv,
  domain: DomainRow,
) => {
  if (domain.bindingSource !== "project_bind") {
    throw new ApiError(409, "Only project-bound domains can be deleted", {
      domainId: domain.id,
      rootDomain: domain.rootDomain,
    });
  }

  const db = getDb(env);
  const activeMailboxes = await db
    .select({ id: mailboxes.id })
    .from(mailboxes)
    .where(
      and(eq(mailboxes.domainId, domain.id), ne(mailboxes.status, "destroyed")),
    )
    .limit(1);

  if (activeMailboxes[0]) {
    throw new ApiError(
      409,
      "Mailbox domain still has non-destroyed mailboxes",
      {
        domainId: domain.id,
        rootDomain: domain.rootDomain,
      },
    );
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
    .where(and(domainNotDeletedFilter, eq(domains.status, "active")))
    .orderBy(...orderByRootDomain);

  return rows.map((row) => row.rootDomain);
};

export const getDomainById = async (
  env: WorkerEnv,
  domainId: string,
  options?: { includeDeleted?: boolean },
) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(domains)
    .where(
      options?.includeDeleted
        ? eq(domains.id, domainId)
        : and(eq(domains.id, domainId), domainNotDeletedFilter),
    )
    .limit(1);
  return rows[0] ?? null;
};

export const getDomainByRootDomain = async (
  env: WorkerEnv,
  rootDomain: string,
  options?: { includeDeleted?: boolean },
) => {
  const db = getDb(env);
  const normalizedRootDomain = normalizeRootDomain(rootDomain);
  const rows = await db
    .select()
    .from(domains)
    .where(
      options?.includeDeleted
        ? eq(domains.rootDomain, normalizedRootDomain)
        : and(
            eq(domains.rootDomain, normalizedRootDomain),
            domainNotDeletedFilter,
          ),
    )
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
    .where(and(domainNotDeletedFilter, eq(domains.status, "active")))
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
  const rootDomain = normalizeRootDomain(input.rootDomain);
  const zoneId = input.zoneId.trim();
  if (!zoneId) {
    throw new ApiError(400, "zoneId is required");
  }
  await requireCatalogZone(config, rootDomain, zoneId);
  const existing = await getDomainByRootDomain(env, rootDomain, {
    includeDeleted: true,
  });

  return persistManagedDomain(env, config, {
    rootDomain,
    zoneId,
    bindingSource:
      existing && !existing.deletedAt ? existing.bindingSource : "catalog",
  });
};

export const bindDomain = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  input: { rootDomain: string },
) => {
  const rootDomain = normalizeRootDomain(input.rootDomain);
  const existing = await getDomainByRootDomain(env, rootDomain, {
    includeDeleted: true,
  });
  const createState = classifyDomainCreateState(existing);
  if (createState.kind === "conflict") {
    throw new ApiError(409, "Mailbox domain already exists", {
      rootDomain,
    });
  }

  const zone = await createZone(config, rootDomain);
  try {
    return await persistManagedDomain(env, config, {
      rootDomain,
      zoneId: zone.id,
      bindingSource: "project_bind",
    });
  } catch (error) {
    try {
      await deleteZone(config, {
        rootDomain,
        zoneId: zone.id,
      });
    } catch (cleanupError) {
      throw new ApiError(
        502,
        "Failed to persist bound domain and clean up Cloudflare zone",
        {
          rootDomain,
          zoneId: zone.id,
          cause: error instanceof Error ? error.message : String(error),
          cleanupError:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        },
      );
    }

    throw error;
  }
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
    deletedAt: null,
  };

  await db
    .update(domains)
    .set({
      status: next.status,
      lastProvisionError: next.lastProvisionError,
      updatedAt: next.updatedAt,
      lastProvisionedAt: next.lastProvisionedAt,
      disabledAt: next.disabledAt,
      deletedAt: next.deletedAt,
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
    deletedAt: null,
  } satisfies DomainRow;

  await db
    .update(domains)
    .set({
      status: next.status,
      disabledAt: next.disabledAt,
      updatedAt: next.updatedAt,
      deletedAt: next.deletedAt,
    })
    .where(eq(domains.id, existing.id));

  return toDomainDto(next);
};

export const deleteDomain = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domainId: string,
) => {
  const db = getDb(env);
  const existing = await getDomainById(env, domainId, {
    includeDeleted: true,
  });
  if (!existing) throw new ApiError(404, "Mailbox domain not found");
  if (existing.deletedAt) return;

  await requireDomainDeleteAllowed(env, existing);
  await deleteZone(config, {
    rootDomain: existing.rootDomain,
    zoneId: existing.zoneId,
  });

  const deletedAt = nowIso();
  await db
    .update(domains)
    .set({
      status: "disabled",
      disabledAt: existing.disabledAt ?? deletedAt,
      updatedAt: deletedAt,
      deletedAt,
    })
    .where(eq(domains.id, existing.id));

  await db.delete(subdomains).where(eq(subdomains.domainId, existing.id));
};

export const resolveMailboxDomain = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  mailbox: MailboxDomainRef,
) => {
  if (mailbox.domainId) {
    const byId = await getDomainById(env, mailbox.domainId, {
      includeDeleted: true,
    });
    if (byId) return byId;
  }

  const extractedRootDomain = extractRootDomainFromAddress(
    mailbox.address,
    mailbox.subdomain,
  );
  if (!extractedRootDomain) return null;

  const byRootDomain = await getDomainByRootDomain(env, extractedRootDomain, {
    includeDeleted: true,
  });
  if (byRootDomain) return byRootDomain;

  const legacyRootDomain = config.MAIL_DOMAIN
    ? normalizeRootDomain(config.MAIL_DOMAIN)
    : null;
  if (legacyRootDomain && extractedRootDomain === legacyRootDomain) {
    const timestamp = nowIso();
    return {
      id: "legacy-domain",
      rootDomain: legacyRootDomain,
      zoneId: config.CLOUDFLARE_ZONE_ID ?? null,
      bindingSource: "catalog",
      status: "active",
      lastProvisionError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastProvisionedAt: null,
      disabledAt: null,
      deletedAt: null,
    } satisfies DomainRow;
  }

  return null;
};
