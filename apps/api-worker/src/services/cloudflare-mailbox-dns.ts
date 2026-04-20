import type { RuntimeConfig, WorkerEnv } from "../env";
import { ApiError } from "../lib/errors";
import type {
  CloudflareRequestSource,
  EmailRoutingDomain,
} from "./emailRouting";
import {
  deleteSubdomainEmailRoutingDnsRecords,
  unlockEmailRoutingDnsRecords,
} from "./emailRouting";

interface CloudflareError {
  code?: number;
  message: string;
}

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: CloudflareError[];
  result: T;
}

interface CloudflareDnsRecord {
  id: string;
  type: string;
  name: string;
  content?: string | null;
  priority?: number | null;
  ttl?: number | null;
  meta?: {
    email_routing?: boolean;
    read_only?: boolean;
  } | null;
}

const emailRoutingMxTargets = new Set([
  "route1.mx.cloudflare.net",
  "route2.mx.cloudflare.net",
  "route3.mx.cloudflare.net",
]);

const emailRoutingSpfValue = "v=spf1 include:_spf.mx.cloudflare.net ~all";

const ensureManagementEnabled = (config: RuntimeConfig) => {
  if (!config.EMAIL_ROUTING_MANAGEMENT_ENABLED) return false;
  if (!config.CLOUDFLARE_API_TOKEN) {
    throw new ApiError(
      500,
      "Email Routing management is enabled but CLOUDFLARE_RUNTIME_API_TOKEN or CLOUDFLARE_API_TOKEN is not configured",
    );
  }
  return true;
};

const requireZoneId = (domain: EmailRoutingDomain) => {
  if (domain.zoneId) return domain.zoneId;
  throw new ApiError(
    500,
    `Domain ${domain.rootDomain} is missing a Cloudflare zone id`,
  );
};

const normalizeDnsValue = (value: string | null | undefined) =>
  value?.trim().toLowerCase().replace(/\.$/, "") ?? "";

const isEmailRoutingSpfRecord = (content: string | null | undefined) =>
  normalizeDnsValue(content).replace(/^"|"$/g, "") === emailRoutingSpfValue;

const isEmailRoutingDnsRecord = (record: CloudflareDnsRecord, fqdn: string) => {
  const normalizedName = normalizeDnsValue(record.name);
  if (normalizedName !== normalizeDnsValue(fqdn)) {
    return false;
  }

  if (
    record.meta?.email_routing === true &&
    (record.type === "MX" || record.type === "TXT")
  ) {
    return true;
  }

  if (record.type === "MX") {
    return emailRoutingMxTargets.has(normalizeDnsValue(record.content));
  }

  if (record.type === "TXT") {
    return isEmailRoutingSpfRecord(record.content);
  }

  return false;
};

const isProjectMailboxExactDnsRecord = (
  record: CloudflareDnsRecord,
  rootDomain: string,
) => {
  const normalizedName = normalizeDnsValue(record.name);
  const normalizedRootDomain = normalizeDnsValue(rootDomain);

  if (
    !normalizedName ||
    normalizedName === normalizedRootDomain ||
    normalizedName === `*.${normalizedRootDomain}` ||
    normalizedName.startsWith("*.")
  ) {
    return false;
  }

  if (!normalizedName.endsWith(`.${normalizedRootDomain}`)) {
    return false;
  }

  return isEmailRoutingDnsRecord(record, normalizedName);
};

const toRelativeHost = (name: string, rootDomain: string) => {
  const normalizedName = normalizeDnsValue(name);
  const normalizedRootDomain = normalizeDnsValue(rootDomain);
  if (!normalizedName.endsWith(`.${normalizedRootDomain}`)) {
    return null;
  }

  return normalizedName.slice(0, -(normalizedRootDomain.length + 1));
};

const cfRequest = async <T>(
  config: RuntimeConfig,
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });

  let data: CloudflareEnvelope<T> | null = null;
  try {
    data = (await response.json()) as CloudflareEnvelope<T>;
  } catch {
    data = null;
  }

  if (!response.ok || !data?.success) {
    throw new ApiError(
      response.status || 502,
      data?.errors?.[0]?.message ?? "Cloudflare API request failed",
    );
  }

  return data.result;
};

const listAllDnsRecords = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  if (!ensureManagementEnabled(config)) return [] as CloudflareDnsRecord[];
  const zoneId = requireZoneId(domain);
  const records: CloudflareDnsRecord[] = [];
  const perPage = 100;

  for (let page = 1; page < 100; page += 1) {
    const pageRecords = await cfRequest<CloudflareDnsRecord[]>(
      config,
      `/zones/${zoneId}/dns_records?per_page=${perPage}&page=${page}`,
    );
    records.push(...pageRecords);
    if (pageRecords.length < perPage) {
      break;
    }
  }

  return records;
};

const listDnsRecordsByName = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  name: string,
) => {
  if (!ensureManagementEnabled(config)) return [] as CloudflareDnsRecord[];
  const zoneId = requireZoneId(domain);
  return cfRequest<CloudflareDnsRecord[]>(
    config,
    `/zones/${zoneId}/dns_records?per_page=100&name=${encodeURIComponent(name)}`,
  );
};

const deleteDnsRecordById = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  recordId: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);

  try {
    await cfRequest(config, `/zones/${zoneId}/dns_records/${recordId}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      /dns record not found|record not found/i.test(error.message)
    ) {
      return;
    }
    throw error;
  }
};

export const listProjectMailboxExactDnsHosts = async (
  _env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  _requestSource?: CloudflareRequestSource,
) => {
  const records = await listAllDnsRecords(config, domain);
  const hosts: string[] = [];
  const seenHosts = new Set<string>();

  for (const record of records) {
    if (!isProjectMailboxExactDnsRecord(record, domain.rootDomain)) {
      continue;
    }

    const relativeHost = toRelativeHost(record.name, domain.rootDomain);
    if (!relativeHost || seenHosts.has(relativeHost)) {
      continue;
    }

    seenHosts.add(relativeHost);
    hosts.push(relativeHost);
  }

  return hosts;
};

export const purgeProjectMailboxExactDnsHosts = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  requestSource: CloudflareRequestSource,
  options?: {
    onHostDeleted?: (context: {
      host: string;
      deletedCount: number;
      totalCount: number;
    }) => Promise<void> | void;
  },
) => {
  const hosts = await listProjectMailboxExactDnsHosts(
    env,
    config,
    domain,
    requestSource,
  );
  let deletedHostCount = 0;

  for (const host of hosts) {
    const fqdn = `${host}.${domain.rootDomain}`;
    await unlockEmailRoutingDnsRecords(env, config, domain, requestSource, {
      name: fqdn,
    });
    await deleteSubdomainEmailRoutingDnsRecords(
      env,
      config,
      domain,
      host,
      requestSource,
    );
    deletedHostCount += 1;
    await options?.onHostDeleted?.({
      host: fqdn,
      deletedCount: deletedHostCount,
      totalCount: hosts.length,
    });
  }

  return {
    hosts,
    deletedHostCount,
  };
};

export const deleteWildcardEmailRoutingDnsRecords = async (
  _env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  _requestSource?: CloudflareRequestSource,
) => {
  const wildcardName = `*.${domain.rootDomain}`;
  const records = await listDnsRecordsByName(config, domain, wildcardName);
  const matchedRecords = records.filter((record) =>
    isEmailRoutingDnsRecord(record, wildcardName),
  );

  for (const record of matchedRecords) {
    await deleteDnsRecordById(config, domain, record.id);
  }

  return {
    matchedRecordCount: matchedRecords.length,
  };
};
