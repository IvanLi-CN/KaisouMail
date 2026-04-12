import { domainCatalogItemSchema, domainSchema } from "@kaisoumail/shared";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../db/client";
import { domains, mailboxes, subdomains } from "../db/schema";
import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso, randomId } from "../lib/crypto";
import { chunkD1InsertValues } from "../lib/d1-batches";
import {
  extractRootDomainFromAddress,
  normalizeRootDomain,
  parseMailboxAddressAgainstDomains,
} from "../lib/email";
import { ApiError } from "../lib/errors";
import {
  type CloudflareCatchAllRule,
  type CloudflareZoneSummary,
  createZone,
  deleteZone,
  type EmailRoutingDomain,
  enableDomainRouting,
  getCatchAllRule,
  listZones,
  updateCatchAllRule,
  validateZoneAccess,
} from "./emailRouting";

export type DomainRow = typeof domains.$inferSelect;
type SubdomainRow = typeof subdomains.$inferSelect;
type MailboxDomainRef = Pick<
  typeof mailboxes.$inferSelect,
  "address" | "subdomain" | "domainId"
>;
type DomainDeleteMailboxRow = Pick<
  typeof mailboxes.$inferSelect,
  "id" | "address" | "subdomain" | "domainId" | "status"
>;
type DomainBindingSource = DomainRow["bindingSource"];
type ManagedDomainProvisionState = Pick<
  DomainRow,
  "status" | "lastProvisionError" | "lastProvisionedAt"
>;

const catchAllRestoreStateSchema = z.object({
  enabled: z.boolean(),
  name: z.string(),
  matchers: z.array(
    z.object({
      field: z.string().optional(),
      type: z.string(),
      value: z.string().optional(),
    }),
  ),
  actions: z.array(
    z.object({
      type: z.string(),
      value: z.array(z.string()),
    }),
  ),
});

type CatchAllRestoreState = z.infer<typeof catchAllRestoreStateSchema>;
const managedCatchAllNamePrefix = "KaisouMail Catch All";

const toDomainDto = (row: DomainRow) =>
  domainSchema.parse({
    id: row.id,
    rootDomain: row.rootDomain,
    zoneId: row.zoneId,
    bindingSource: row.bindingSource,
    status: row.status,
    catchAllEnabled: row.catchAllEnabled,
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
    catchAllEnabled: input.row?.catchAllEnabled ?? false,
    lastProvisionError: input.row?.lastProvisionError ?? null,
    createdAt: input.row?.createdAt ?? null,
    updatedAt: input.row?.updatedAt ?? null,
    lastProvisionedAt: input.row?.lastProvisionedAt ?? null,
    disabledAt: input.row?.disabledAt ?? null,
  });

const parseCatchAllRestoreState = (value: string | null) => {
  if (!value) return null;

  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    throw new ApiError(500, "Domain catch-all restore state is invalid");
  }

  const parsed = catchAllRestoreStateSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(500, "Domain catch-all restore state is invalid");
  }

  return parsed.data;
};

const serializeCatchAllRestoreState = (value: CatchAllRestoreState) =>
  JSON.stringify(value);

const toCatchAllRestoreState = (
  rule: CloudflareCatchAllRule,
): CatchAllRestoreState => ({
  enabled: rule.enabled,
  name: rule.name,
  matchers: rule.matchers,
  actions: rule.actions,
});

const buildManagedCatchAllRule = (
  domain: DomainRow,
  currentRule: CloudflareCatchAllRule,
  workerName: string,
): CloudflareCatchAllRule => ({
  enabled: true,
  name: `${managedCatchAllNamePrefix} (${domain.rootDomain})`,
  matchers:
    currentRule.matchers.length > 0 ? currentRule.matchers : [{ type: "all" }],
  actions: [{ type: "worker", value: [workerName] }],
});

const resetCatchAllState = <TRow extends DomainRow>(
  row: TRow,
  updatedAt: string | null,
): TRow => ({
  ...row,
  catchAllEnabled: false,
  catchAllOwnerUserId: null,
  catchAllRestoreStateJson: null,
  catchAllUpdatedAt: updatedAt,
});

const retireCatchAllMailboxes = async (
  db: ReturnType<typeof getDb>,
  domainId: string,
  destroyedAt: string,
) => {
  await db
    .update(mailboxes)
    .set({
      status: "destroyed",
      destroyedAt,
      routingRuleId: null,
    })
    .where(
      and(
        eq(mailboxes.domainId, domainId),
        eq(mailboxes.source, "catch_all"),
        eq(mailboxes.status, "active"),
      ),
    );
};

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

const resolveCatalogBindingSource = (
  existing: DomainRow | null,
  zoneId: string,
): DomainBindingSource => {
  if (
    existing?.bindingSource === "project_bind" &&
    existing.zoneId?.trim() === zoneId
  ) {
    return "project_bind";
  }

  return "catalog";
};

const requireCatchAllWorkerName = (config: RuntimeConfig) => {
  if (config.EMAIL_WORKER_NAME) return config.EMAIL_WORKER_NAME;
  throw new ApiError(
    500,
    "Catch-all management requires EMAIL_WORKER_NAME to be configured",
  );
};

const requireCatchAllManagementEnabled = (
  config: RuntimeConfig,
  operation: "enable" | "disable",
) => {
  if (config.EMAIL_ROUTING_MANAGEMENT_ENABLED) return;
  throw new ApiError(
    409,
    `Catch-all ${operation} requires EMAIL_ROUTING_MANAGEMENT_ENABLED=true`,
  );
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

const findCatalogZone = async (
  config: RuntimeConfig,
  rootDomain: string,
  zoneId: string,
) => {
  if (!config.EMAIL_ROUTING_MANAGEMENT_ENABLED) return null;

  const zonesByRootDomain = await listCloudflareZonesByRootDomain(config);
  const zone = zonesByRootDomain.get(rootDomain);
  return zone && zone.id === zoneId ? zone : null;
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

const isRecoverableBindProvisionError = (error: unknown) => {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401 || error.status === 403 || error.status >= 500) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    error.status === 409 ||
    error.status === 429 ||
    message.includes("pending") ||
    message.includes("activate") ||
    message.includes("activation") ||
    message.includes("delegat") ||
    message.includes("nameserver") ||
    message.includes("name server")
  );
};

const resolveProvisionState = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  options?: {
    allowProvisioningError?: boolean | ((error: unknown) => boolean);
  },
): Promise<ManagedDomainProvisionState> => {
  try {
    return await provisionDomain(config, domain);
  } catch (error) {
    const allowProvisioningError =
      typeof options?.allowProvisioningError === "function"
        ? options.allowProvisioningError(error)
        : (options?.allowProvisioningError ?? false);

    if (!allowProvisioningError) {
      throw error;
    }

    return {
      status: "provisioning_error",
      lastProvisionError:
        error instanceof Error ? error.message : "Failed to provision domain",
      lastProvisionedAt: null,
    };
  }
};

const persistBoundZone = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  input: {
    rootDomain: string;
    zoneId: string;
    bindingSource: DomainBindingSource;
  },
) => {
  const provisionState = await resolveProvisionState(
    config,
    {
      rootDomain: input.rootDomain,
      zoneId: input.zoneId,
    },
    {
      allowProvisioningError: isRecoverableBindProvisionError,
    },
  );

  return persistManagedDomain(env, {
    rootDomain: input.rootDomain,
    zoneId: input.zoneId,
    bindingSource: input.bindingSource,
    provisionState,
  });
};

const createAndPersistBoundZone = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  rootDomain: string,
) => {
  const zone = await createZone(config, rootDomain);
  try {
    return await persistBoundZone(env, config, {
      rootDomain,
      zoneId: zone.id,
      bindingSource: "project_bind",
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      const current = await getDomainByRootDomain(env, rootDomain, {
        includeDeleted: true,
      });
      if (current && !current.deletedAt && current.zoneId === zone.id) {
        return {
          domain: toDomainDto(current),
          created: false,
        };
      }
    }

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

const persistManagedDomain = async (
  env: WorkerEnv,
  input: {
    rootDomain: string;
    zoneId: string;
    bindingSource: DomainBindingSource;
    provisionState: ManagedDomainProvisionState;
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

  if (createState.kind === "replace") {
    const baseRow = createState.row.deletedAt
      ? resetCatchAllState(createState.row, null)
      : createState.row;
    const next: DomainRow = {
      ...baseRow,
      zoneId: input.zoneId,
      bindingSource: input.bindingSource,
      status: input.provisionState.status,
      lastProvisionError: input.provisionState.lastProvisionError,
      updatedAt,
      lastProvisionedAt: input.provisionState.lastProvisionedAt,
      disabledAt: null,
      deletedAt: null,
    };

    await db
      .update(domains)
      .set({
        zoneId: next.zoneId,
        bindingSource: next.bindingSource,
        status: next.status,
        catchAllEnabled: next.catchAllEnabled,
        catchAllOwnerUserId: next.catchAllOwnerUserId,
        catchAllRestoreStateJson: next.catchAllRestoreStateJson,
        catchAllUpdatedAt: next.catchAllUpdatedAt,
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
    status: input.provisionState.status,
    catchAllEnabled: existing?.catchAllEnabled ?? false,
    catchAllOwnerUserId: existing?.catchAllOwnerUserId ?? null,
    catchAllRestoreStateJson: existing?.catchAllRestoreStateJson ?? null,
    catchAllUpdatedAt: existing?.catchAllUpdatedAt ?? null,
    lastProvisionError: input.provisionState.lastProvisionError,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
    lastProvisionedAt: input.provisionState.lastProvisionedAt,
    disabledAt: null,
    deletedAt: null,
  };

  await db.insert(domains).values(domain);
  return {
    domain: toDomainDto(domain),
    created: true,
  };
};

const softDeleteDomainLocally = async (
  db: ReturnType<typeof getDb>,
  domain: DomainRow,
  deletedAt: string,
) => {
  const cachedSubdomains = await db
    .select()
    .from(subdomains)
    .where(eq(subdomains.domainId, domain.id));
  let subdomainsDeleted = false;

  try {
    await db
      .update(domains)
      .set({
        status: "disabled",
        disabledAt: domain.disabledAt ?? deletedAt,
        updatedAt: deletedAt,
        deletedAt,
      })
      .where(eq(domains.id, domain.id));

    await db.delete(subdomains).where(eq(subdomains.domainId, domain.id));
    subdomainsDeleted = true;
  } catch (error) {
    await restoreSoftDeletedDomainLocally(db, domain, cachedSubdomains, {
      reinsertSubdomains: subdomainsDeleted,
    });
    throw error;
  }

  return {
    cachedSubdomains,
    deletedAt,
  };
};

const restoreSoftDeletedDomainLocally = async (
  db: ReturnType<typeof getDb>,
  domain: DomainRow,
  cachedSubdomains: SubdomainRow[],
  options?: { reinsertSubdomains?: boolean },
) => {
  await db
    .update(domains)
    .set({
      zoneId: domain.zoneId,
      bindingSource: domain.bindingSource,
      status: domain.status,
      lastProvisionError: domain.lastProvisionError,
      updatedAt: domain.updatedAt,
      lastProvisionedAt: domain.lastProvisionedAt,
      disabledAt: domain.disabledAt,
      deletedAt: domain.deletedAt,
    })
    .where(eq(domains.id, domain.id));

  if ((options?.reinsertSubdomains ?? true) && cachedSubdomains.length > 0) {
    await db.delete(subdomains).where(eq(subdomains.domainId, domain.id));
    for (const subdomainChunk of chunkD1InsertValues(cachedSubdomains)) {
      await db.insert(subdomains).values(subdomainChunk);
    }
  }
};

const mailboxReferencesDomain = (
  mailbox: DomainDeleteMailboxRow,
  domain: DomainRow,
) => {
  if (mailbox.domainId) {
    return mailbox.domainId === domain.id;
  }

  const extractedRootDomain = extractRootDomainFromAddress(
    mailbox.address,
    mailbox.subdomain,
  );
  if (!extractedRootDomain) return false;
  return normalizeRootDomain(extractedRootDomain) === domain.rootDomain;
};

const requireDomainDeleteAllowed = async (
  env: WorkerEnv,
  domain: DomainRow,
) => {
  const db = getDb(env);
  const activeMailboxes = await db
    .select({
      id: mailboxes.id,
      address: mailboxes.address,
      subdomain: mailboxes.subdomain,
      domainId: mailboxes.domainId,
      status: mailboxes.status,
    })
    .from(mailboxes)
    .where(ne(mailboxes.status, "destroyed"))
    .orderBy(asc(mailboxes.createdAt));

  const blockingMailbox = activeMailboxes.find((mailbox) =>
    mailboxReferencesDomain(mailbox, domain),
  );

  if (blockingMailbox) {
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

const requireProjectBoundDomain = (domain: DomainRow) => {
  if (domain.bindingSource !== "project_bind") {
    throw new ApiError(409, "Only project-bound domains can be deleted", {
      domainId: domain.id,
      rootDomain: domain.rootDomain,
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
    .where(and(domainNotDeletedFilter, eq(domains.status, "active")))
    .orderBy(...orderByRootDomain);

  return rows.map((row) => row.rootDomain);
};

export const resolveCatchAllDomainForAddress = async (
  env: WorkerEnv,
  address: string,
) => {
  const db = getDb(env);
  const rows = await db
    .select()
    .from(domains)
    .where(
      and(
        domainNotDeletedFilter,
        eq(domains.status, "active"),
        eq(domains.catchAllEnabled, true),
      ),
    )
    .orderBy(...orderByRootDomain);
  if (rows.length === 0) return null;

  const parsed = parseMailboxAddressAgainstDomains(
    address,
    rows.map((row) => row.rootDomain),
  );
  if (!parsed) return null;

  return rows.find((row) => row.rootDomain === parsed.rootDomain) ?? null;
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
  const existing = await getDomainByRootDomain(env, rootDomain, {
    includeDeleted: true,
  });
  await requireCatalogZone(config, rootDomain, zoneId);
  const provisionState = await resolveProvisionState(
    config,
    {
      rootDomain,
      zoneId,
    },
    { allowProvisioningError: true },
  );

  return persistManagedDomain(env, {
    rootDomain,
    zoneId,
    bindingSource: resolveCatalogBindingSource(existing, zoneId),
    provisionState,
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

  if (createState.kind === "replace") {
    const existingZoneId = createState.row.zoneId?.trim();
    if (existingZoneId) {
      const catalogZone = await findCatalogZone(
        config,
        rootDomain,
        existingZoneId,
      );
      if (catalogZone) {
        return await persistBoundZone(env, config, {
          rootDomain,
          zoneId: existingZoneId,
          bindingSource: createState.row.bindingSource,
        });
      }
    }
  }

  return createAndPersistBoundZone(env, config, rootDomain);
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
  const provisionState = await resolveProvisionState(
    config,
    {
      rootDomain: existing.rootDomain,
      zoneId: existing.zoneId,
    },
    { allowProvisioningError: true },
  );

  const next = {
    ...existing,
    status: provisionState.status,
    lastProvisionError: provisionState.lastProvisionError,
    updatedAt,
    lastProvisionedAt: provisionState.lastProvisionedAt,
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

export const enableDomainCatchAll = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domainId: string,
  actor: { id: string },
) => {
  requireCatchAllManagementEnabled(config, "enable");
  const db = getDb(env);
  const existing = await getDomainById(env, domainId);
  if (!existing) throw new ApiError(404, "Mailbox domain not found");
  if (existing.status !== "active") {
    throw new ApiError(409, "Only active mailbox domains can enable catch-all");
  }
  if (existing.catchAllEnabled) {
    return toDomainDto(existing);
  }

  const currentRule = await getCatchAllRule(config, existing);
  if (!currentRule) {
    throw new ApiError(500, "Catch-all rule is not available");
  }

  const workerName = requireCatchAllWorkerName(config);
  const restoreState =
    parseCatchAllRestoreState(existing.catchAllRestoreStateJson) ??
    toCatchAllRestoreState(currentRule);
  await updateCatchAllRule(
    config,
    existing,
    buildManagedCatchAllRule(existing, currentRule, workerName),
  );

  const updatedAt = nowIso();
  const next: DomainRow = {
    ...existing,
    catchAllEnabled: true,
    catchAllOwnerUserId: actor.id,
    catchAllRestoreStateJson: serializeCatchAllRestoreState(restoreState),
    catchAllUpdatedAt: updatedAt,
    updatedAt,
  };

  await db
    .update(domains)
    .set({
      catchAllEnabled: true,
      catchAllOwnerUserId: actor.id,
      catchAllRestoreStateJson: next.catchAllRestoreStateJson,
      catchAllUpdatedAt: updatedAt,
      updatedAt,
    })
    .where(eq(domains.id, existing.id));

  return toDomainDto(next);
};

export const disableDomainCatchAll = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domainId: string,
) => {
  requireCatchAllManagementEnabled(config, "disable");
  const db = getDb(env);
  const existing = await getDomainById(env, domainId);
  if (!existing) throw new ApiError(404, "Mailbox domain not found");
  if (!existing.catchAllEnabled) {
    return toDomainDto(existing);
  }

  const restoreState = parseCatchAllRestoreState(
    existing.catchAllRestoreStateJson,
  );
  if (!restoreState) {
    throw new ApiError(500, "Domain catch-all restore state is missing");
  }

  await updateCatchAllRule(config, existing, restoreState);

  const updatedAt = nowIso();
  const next: DomainRow = {
    ...existing,
    catchAllEnabled: false,
    catchAllOwnerUserId: null,
    catchAllRestoreStateJson: null,
    catchAllUpdatedAt: updatedAt,
    updatedAt,
  };

  await db
    .update(domains)
    .set({
      catchAllEnabled: false,
      catchAllOwnerUserId: null,
      catchAllRestoreStateJson: null,
      catchAllUpdatedAt: updatedAt,
      updatedAt,
    })
    .where(eq(domains.id, existing.id));
  await retireCatchAllMailboxes(db, existing.id, updatedAt);

  return toDomainDto(next);
};

export const disableDomain = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domainId: string,
) => {
  const db = getDb(env);
  const existing = await getDomainById(env, domainId);
  if (!existing) throw new ApiError(404, "Mailbox domain not found");
  if (existing.status === "disabled") return toDomainDto(existing);

  if (existing.catchAllEnabled) {
    requireCatchAllManagementEnabled(config, "disable");
    await disableDomainCatchAll(env, config, existing.id);
  }

  const refreshed = await getDomainById(env, domainId);
  if (!refreshed) throw new ApiError(404, "Mailbox domain not found");
  if (refreshed.status === "disabled") return toDomainDto(refreshed);

  const disabledAt = nowIso();
  const next = {
    ...refreshed,
    status: "disabled",
    disabledAt,
    updatedAt: disabledAt,
    lastProvisionError: refreshed.lastProvisionError,
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

  requireProjectBoundDomain(existing);
  if (existing.deletedAt) {
    await requireDomainDeleteAllowed(env, existing);
    await deleteZone(config, {
      rootDomain: existing.rootDomain,
      zoneId: existing.zoneId,
    });
    return;
  }

  const deletedAt = nowIso();
  const localDelete = await softDeleteDomainLocally(db, existing, deletedAt);

  try {
    await requireDomainDeleteAllowed(env, existing);
  } catch (error) {
    await restoreSoftDeletedDomainLocally(
      db,
      existing,
      localDelete.cachedSubdomains,
    );
    throw error;
  }

  try {
    await deleteZone(config, {
      rootDomain: existing.rootDomain,
      zoneId: existing.zoneId,
    });
  } catch (error) {
    try {
      await restoreSoftDeletedDomainLocally(
        db,
        existing,
        localDelete.cachedSubdomains,
      );
    } catch (rollbackError) {
      throw new ApiError(
        502,
        "Failed to delete Cloudflare zone and roll back local domain state",
        {
          rootDomain: existing.rootDomain,
          zoneId: existing.zoneId,
          cause: error instanceof Error ? error.message : String(error),
          rollbackError:
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
        },
      );
    }

    throw error;
  }
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
      catchAllEnabled: false,
      catchAllOwnerUserId: null,
      catchAllRestoreStateJson: null,
      catchAllUpdatedAt: null,
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
