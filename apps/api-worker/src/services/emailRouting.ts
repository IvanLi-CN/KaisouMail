import type { RuntimeConfig, WorkerEnv } from "../env";
import { ApiError } from "../lib/errors";
import {
  buildRateLimitErrorDetails,
  resolveRetryAfterIso,
  resolveRetryAfterSeconds,
} from "../lib/rate-limit";
import { getRuntimeStateValue, setRuntimeStateValue } from "./runtime-state";

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

export interface CloudflareEmailRoutingMatcher {
  field?: string;
  type: string;
  value?: string;
}

export interface CloudflareEmailRoutingAction {
  type: string;
  value: string[];
}

export interface CloudflareCatchAllRule {
  enabled: boolean;
  name: string;
  matchers: CloudflareEmailRoutingMatcher[];
  actions: CloudflareEmailRoutingAction[];
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

interface CloudflareCatchAllRuleResult {
  id?: string;
  tag?: string;
  enabled?: boolean | null;
  name?: string | null;
  matchers?: CloudflareEmailRoutingMatcher[] | null;
  actions?: CloudflareEmailRoutingAction[] | null;
}

const toZoneSummary = (zone: CloudflareZoneResult): CloudflareZoneSummary => ({
  id: zone.id,
  name: zone.name,
  status: zone.status ?? null,
  nameServers: zone.name_servers ?? [],
});

const defaultCatchAllMatcher: CloudflareEmailRoutingMatcher = {
  type: "all",
};

const toCatchAllRule = (
  rule: CloudflareCatchAllRuleResult | null,
): CloudflareCatchAllRule => ({
  enabled: rule?.enabled ?? false,
  name: rule?.name?.trim() || "Catch all",
  matchers:
    rule?.matchers && rule.matchers.length > 0
      ? rule.matchers
      : [defaultCatchAllMatcher],
  actions: rule?.actions ?? [],
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

const CLOUDFLARE_RATE_LIMITED_UNTIL_KEY = "cloudflare_api_rate_limited_until";

const createCloudflareRateLimitError = ({
  retryAfter,
  retryAfterSeconds,
}: {
  retryAfter: string;
  retryAfterSeconds: number;
}) =>
  new ApiError(
    429,
    "Cloudflare API rate limit reached; retry later",
    buildRateLimitErrorDetails({
      retryAfter,
      retryAfterSeconds,
      source: "cloudflare",
    }),
    {
      "retry-after": String(retryAfterSeconds),
    },
  );

export const getCloudflareRateLimitState = async (env: WorkerEnv) => {
  const value = await getRuntimeStateValue(
    env,
    CLOUDFLARE_RATE_LIMITED_UNTIL_KEY,
  );
  if (!value) return null;

  const retryAfterTime = Date.parse(value);
  if (Number.isNaN(retryAfterTime) || retryAfterTime <= Date.now()) {
    return null;
  }

  return {
    retryAfter: new Date(retryAfterTime).toISOString(),
    retryAfterSeconds: Math.max(
      0,
      Math.ceil((retryAfterTime - Date.now()) / 1000),
    ),
  };
};

const ensureCloudflareRequestAllowed = async (env: WorkerEnv) => {
  const state = await getCloudflareRateLimitState(env);
  if (!state) return;
  throw createCloudflareRateLimitError(state);
};

const rememberCloudflareRateLimit = async (
  env: WorkerEnv,
  response: Response,
) => {
  const retryAfterSeconds = resolveRetryAfterSeconds(
    response.headers.get("retry-after"),
  );
  const retryAfter = resolveRetryAfterIso(retryAfterSeconds);
  await setRuntimeStateValue(
    env,
    CLOUDFLARE_RATE_LIMITED_UNTIL_KEY,
    retryAfter,
  );
  return {
    retryAfter,
    retryAfterSeconds,
  };
};

const cfRequest = async <T>(
  env: WorkerEnv,
  config: RuntimeConfig,
  path: string,
  init?: RequestInit,
  options?: {
    ignoreStatuses?: number[];
    ignoreWhen?: (context: {
      response: Response;
      data: CloudflareEnvelope<T> | null;
    }) => boolean;
    skipRateLimitCheck?: boolean;
  },
) => {
  if (!options?.skipRateLimitCheck) {
    await ensureCloudflareRequestAllowed(env);
  }

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

  if (response.status === 429) {
    throw createCloudflareRateLimitError(
      await rememberCloudflareRateLimit(env, response),
    );
  }

  if (!response.ok || !data?.success) {
    throw new ApiError(
      response.status || 502,
      data?.errors?.[0]?.message ?? "Cloudflare API request failed",
    );
  }

  return data.result;
};

export const listZones = async (env: WorkerEnv, config: RuntimeConfig) => {
  if (!ensureManagementEnabled(config)) return [];
  const result = await cfRequest<CloudflareZoneResult[]>(
    env,
    config,
    "/zones?per_page=100",
  );
  return (result ?? []).map(toZoneSummary);
};

export const createZone = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  rootDomain: string,
) => {
  requireDomainLifecycleManagement(config, "binding");
  const result = await cfRequest<CloudflareZoneResult>(env, config, "/zones", {
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
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  options?: {
    bypassRateLimitCheck?: boolean;
  },
) => {
  requireDomainLifecycleManagement(config, "deletion");
  const zoneId = requireZoneId(domain);
  const result = await cfRequest<CloudflareZoneResult>(
    env,
    config,
    `/zones/${zoneId}`,
    { method: "DELETE" },
    {
      ignoreStatuses: [404],
      skipRateLimitCheck: options?.bypassRateLimitCheck ?? false,
    },
  );

  return {
    alreadyMissing: result === null,
  };
};

export const ensureSubdomainEnabled = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  subdomain: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  const fqdn = `${subdomain}.${domain.rootDomain}`;
  const zoneId = requireZoneId(domain);
  await cfRequest(env, config, `/zones/${zoneId}/email/routing/dns`, {
    method: "POST",
    body: JSON.stringify({ name: fqdn }),
  });
};

export const createRoutingRule = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  address: string,
) => {
  if (!ensureManagementEnabled(config)) return null;
  const workerName = requireEmailWorkerName(config);
  const zoneId = requireZoneId(domain);
  const result = await cfRequest<{ id: string }>(
    env,
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

export const getCatchAllRule = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  if (!ensureManagementEnabled(config)) return null;
  const zoneId = requireZoneId(domain);
  const result = await cfRequest<CloudflareCatchAllRuleResult>(
    env,
    config,
    `/zones/${zoneId}/email/routing/rules/catch_all`,
  );
  return toCatchAllRule(result);
};

export const updateCatchAllRule = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  rule: CloudflareCatchAllRule,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(
    env,
    config,
    `/zones/${zoneId}/email/routing/rules/catch_all`,
    {
      method: "PUT",
      body: JSON.stringify(rule),
    },
  );
};

export const deleteRoutingRule = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  ruleId: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(
    env,
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
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest<{ id: string }>(env, config, `/zones/${zoneId}`);
};

export const enableDomainRouting = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(env, config, `/zones/${zoneId}/email/routing/enable`, {
    method: "POST",
  });
};
