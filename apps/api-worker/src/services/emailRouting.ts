import type { RuntimeConfig } from "../env";
import { ApiError } from "../lib/errors";

interface CloudflareError {
  code?: number;
  message: string;
  documentation_url?: string;
  source?: {
    pointer?: string;
  };
}

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: CloudflareError[];
  result: T;
}

export interface EmailRoutingDomain {
  rootDomain: string;
  zoneId: string | null;
}

export interface CloudflareZoneSummary {
  id: string;
  name: string;
  status: string | null;
  nameServers: string[];
}

interface CloudflareZoneResult {
  id: string;
  name: string;
  status?: string | null;
  name_servers?: string[] | null;
}

const toZoneSummary = (zone: CloudflareZoneResult): CloudflareZoneSummary => ({
  id: zone.id,
  name: zone.name,
  status: zone.status ?? null,
  nameServers: zone.name_servers ?? [],
});

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

const requireDomainLifecycleManagement = (
  config: RuntimeConfig,
  operation: "binding" | "deletion",
) => {
  if (!ensureManagementEnabled(config)) {
    throw new ApiError(
      409,
      `Cloudflare domain ${operation} requires EMAIL_ROUTING_MANAGEMENT_ENABLED=true`,
    );
  }
};

const requireZoneId = (domain: EmailRoutingDomain) => {
  if (domain.zoneId) return domain.zoneId;
  throw new ApiError(
    500,
    `Domain ${domain.rootDomain} is missing a Cloudflare zone id`,
  );
};

const requireAccountId = (config: RuntimeConfig) => {
  if (config.CLOUDFLARE_ACCOUNT_ID) return config.CLOUDFLARE_ACCOUNT_ID;
  throw new ApiError(
    500,
    "Cloudflare domain binding requires CLOUDFLARE_ACCOUNT_ID to be configured",
  );
};

const requireEmailWorkerName = (config: RuntimeConfig) => {
  if (config.EMAIL_WORKER_NAME) return config.EMAIL_WORKER_NAME;
  throw new ApiError(
    500,
    "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
  );
};

const hasOnlyMissingRoutingRuleErrors = (
  errors: CloudflareError[] | undefined,
) =>
  errors?.length
    ? errors.every((error) => /rule not found/i.test(error.message))
    : false;

const cfRequest = async <T>(
  config: RuntimeConfig,
  path: string,
  init?: RequestInit,
  options?: {
    ignoreStatuses?: number[];
    ignoreWhen?: (context: {
      response: Response;
      data: CloudflareEnvelope<T> | null;
    }) => boolean;
  },
) => {
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

  if (options?.ignoreWhen?.({ response, data })) {
    return null;
  }

  if (options?.ignoreStatuses?.includes(response.status)) {
    return null;
  }

  if (!response.ok || !data?.success) {
    throw new ApiError(
      response.status || 502,
      data?.errors?.[0]?.message ?? "Cloudflare API request failed",
    );
  }

  return data.result;
};

export const listZones = async (config: RuntimeConfig) => {
  if (!ensureManagementEnabled(config)) return [];
  const result = await cfRequest<CloudflareZoneResult[]>(
    config,
    "/zones?per_page=100",
  );
  return (result ?? []).map(toZoneSummary);
};

export const createZone = async (config: RuntimeConfig, rootDomain: string) => {
  requireDomainLifecycleManagement(config, "binding");
  const result = await cfRequest<CloudflareZoneResult>(config, "/zones", {
    method: "POST",
    body: JSON.stringify({
      account: { id: requireAccountId(config) },
      name: rootDomain,
      type: "full",
    }),
  });
  if (!result) {
    throw new ApiError(502, "Cloudflare API request failed");
  }
  return toZoneSummary(result);
};

export const deleteZone = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  requireDomainLifecycleManagement(config, "deletion");
  const zoneId = requireZoneId(domain);
  const result = await cfRequest<CloudflareZoneResult>(
    config,
    `/zones/${zoneId}`,
    { method: "DELETE" },
    { ignoreStatuses: [404] },
  );

  return {
    alreadyMissing: result === null,
  };
};

export const ensureSubdomainEnabled = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  subdomain: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  const fqdn = `${subdomain}.${domain.rootDomain}`;
  const zoneId = requireZoneId(domain);
  await cfRequest(config, `/zones/${zoneId}/email/routing/dns`, {
    method: "POST",
    body: JSON.stringify({ name: fqdn }),
  });
};

export const createRoutingRule = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  address: string,
) => {
  if (!ensureManagementEnabled(config)) return null;
  const workerName = requireEmailWorkerName(config);
  const zoneId = requireZoneId(domain);
  const result = await cfRequest<{ id: string }>(
    config,
    `/zones/${zoneId}/email/routing/rules`,
    {
      method: "POST",
      body: JSON.stringify({
        name: `Mailbox ${address}`,
        enabled: true,
        matchers: [{ field: "to", type: "literal", value: address }],
        actions: [{ type: "worker", value: [workerName] }],
      }),
    },
  );
  return result?.id ?? null;
};

export const deleteRoutingRule = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  ruleId: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(
    config,
    `/zones/${zoneId}/email/routing/rules/${ruleId}`,
    {
      method: "DELETE",
    },
    {
      ignoreWhen: ({ response, data }) =>
        response.status === 404 &&
        hasOnlyMissingRoutingRuleErrors(data?.errors),
    },
  );
};

export const validateZoneAccess = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest<{ id: string }>(config, `/zones/${zoneId}`);
};

export const enableDomainRouting = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(config, `/zones/${zoneId}/email/routing/enable`, {
    method: "POST",
  });
};
