import type { RuntimeConfig, WorkerEnv } from "../env";
import { nowIso } from "../lib/crypto";
import { ApiError } from "../lib/errors";
import { logOperationalEvent, pickHeaders } from "../lib/observability";
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

export interface CloudflareRequestSource {
  projectOperation: string;
  projectRoute: string;
}

export interface CloudflareRequestContext extends CloudflareRequestSource {
  cloudflareMethod: string;
  cloudflarePath: string;
}

export interface CloudflareRateLimitContext extends CloudflareRequestContext {
  triggeredAt: string;
  retryAfter: string;
  retryAfterSeconds: number;
  lastBlockedAt: string | null;
  lastBlockedBy: CloudflareRequestSource | null;
}

export interface CloudflareRateLimitState {
  retryAfter: string;
  retryAfterSeconds: number;
  rateLimitContext: CloudflareRateLimitContext | null;
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

interface CloudflareDnsRecordResult {
  id: string;
  type: string;
  name: string;
  content?: string | null;
  ttl?: number | null;
  priority?: number | null;
}

interface DeleteSubdomainEmailRoutingDnsRecordsOptions {
  requestBudget?: number;
}

interface DeleteSubdomainEmailRoutingDnsRecordsResult {
  matchedRecordCount: number;
  requestCount: number;
  completed: boolean;
}

interface CloudflareRequestExecutionOptions {
  onRequestAttempted?: () => void;
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

const hasOnlyMissingDnsRecordErrors = (
  errors: CloudflareError[] | undefined,
) =>
  errors?.length
    ? errors.every((error) =>
        /dns record not found|record not found/i.test(error.message),
      )
    : false;

const emailRoutingMxTargets = new Set([
  "route1.mx.cloudflare.net",
  "route2.mx.cloudflare.net",
  "route3.mx.cloudflare.net",
]);

const normalizeDnsValue = (value: string | null | undefined) =>
  value?.trim().toLowerCase().replace(/\.$/, "") ?? "";

const isEmailRoutingSpfRecord = (content: string | null | undefined) => {
  const normalized = normalizeDnsValue(content).replace(/^"|"$/g, "");
  return normalized === "v=spf1 include:_spf.mx.cloudflare.net ~all";
};

const isEmailRoutingDnsRecord = (
  record: CloudflareDnsRecordResult,
  fqdn: string,
) => {
  const normalizedName = normalizeDnsValue(record.name);
  if (normalizedName !== normalizeDnsValue(fqdn)) {
    return false;
  }

  if (record.type === "MX") {
    return emailRoutingMxTargets.has(normalizeDnsValue(record.content));
  }

  if (record.type === "TXT") {
    return isEmailRoutingSpfRecord(record.content);
  }

  return false;
};

const CLOUDFLARE_RATE_LIMITED_UNTIL_KEY = "cloudflare_api_rate_limited_until";
const CLOUDFLARE_RATE_LIMIT_CONTEXT_KEY = "cloudflare_api_rate_limit_context";
const defaultCloudflareRequestSource: CloudflareRequestSource = {
  projectOperation: "cloudflare.internal",
  projectRoute: "internal Cloudflare client",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getCloudflareRequestCount = (value: unknown) => {
  if (!isRecord(value)) return null;
  return typeof value.cloudflareRequestCount === "number"
    ? value.cloudflareRequestCount
    : null;
};

const withCloudflareRequestCount = (error: unknown, requestCount: number) => {
  if (requestCount <= 0) {
    return error;
  }

  if (error instanceof ApiError) {
    const details = isRecord(error.details)
      ? {
          ...error.details,
          cloudflareRequestCount: requestCount,
        }
      : { cloudflareRequestCount: requestCount };
    const wrapped = new ApiError(
      error.status,
      error.message,
      details,
      error.headers,
    );
    wrapped.stack = error.stack;
    return wrapped;
  }

  if (error instanceof Error) {
    return Object.assign(error, { cloudflareRequestCount: requestCount });
  }

  return new ApiError(500, "Cloudflare API request failed", {
    cause: error,
    cloudflareRequestCount: requestCount,
  });
};

export const getCloudflareRequestCountFromError = (error: unknown) =>
  error instanceof ApiError
    ? (getCloudflareRequestCount(error.details) ?? 0)
    : (getCloudflareRequestCount(error) ?? 0);

const isCloudflareRequestSource = (
  value: unknown,
): value is CloudflareRequestSource =>
  isRecord(value) &&
  typeof value.projectOperation === "string" &&
  typeof value.projectRoute === "string";

const parseCloudflareRateLimitContext = (
  value: string | null,
): CloudflareRateLimitContext | null => {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (
    typeof parsed.triggeredAt !== "string" ||
    typeof parsed.retryAfter !== "string" ||
    typeof parsed.retryAfterSeconds !== "number" ||
    typeof parsed.projectOperation !== "string" ||
    typeof parsed.projectRoute !== "string" ||
    typeof parsed.cloudflareMethod !== "string" ||
    typeof parsed.cloudflarePath !== "string"
  ) {
    return null;
  }

  return {
    triggeredAt: parsed.triggeredAt,
    retryAfter: parsed.retryAfter,
    retryAfterSeconds: parsed.retryAfterSeconds,
    projectOperation: parsed.projectOperation,
    projectRoute: parsed.projectRoute,
    cloudflareMethod: parsed.cloudflareMethod,
    cloudflarePath: parsed.cloudflarePath,
    lastBlockedAt:
      typeof parsed.lastBlockedAt === "string" ? parsed.lastBlockedAt : null,
    lastBlockedBy: isCloudflareRequestSource(parsed.lastBlockedBy)
      ? parsed.lastBlockedBy
      : null,
  };
};

const buildCloudflareRequestContext = (
  requestSource: CloudflareRequestSource,
  cloudflareMethod: string,
  cloudflarePath: string,
): CloudflareRequestContext => ({
  projectOperation: requestSource.projectOperation,
  projectRoute: requestSource.projectRoute,
  cloudflareMethod,
  cloudflarePath,
});

const createCloudflareRateLimitError = ({
  retryAfter,
  retryAfterSeconds,
  rateLimitContext,
}: CloudflareRateLimitState) =>
  new ApiError(
    429,
    "Cloudflare API rate limit reached; retry later",
    buildRateLimitErrorDetails({
      retryAfter,
      retryAfterSeconds,
      source: "cloudflare",
      extras: rateLimitContext ? { rateLimitContext } : undefined,
    }),
    {
      "retry-after": String(retryAfterSeconds),
    },
  );

export const getCloudflareRateLimitState = async (
  env: WorkerEnv,
): Promise<CloudflareRateLimitState | null> => {
  const value = await getRuntimeStateValue(
    env,
    CLOUDFLARE_RATE_LIMITED_UNTIL_KEY,
  );
  if (!value) return null;

  const retryAfterTime = Date.parse(value);
  if (Number.isNaN(retryAfterTime) || retryAfterTime <= Date.now()) {
    return null;
  }

  const retryAfter = new Date(retryAfterTime).toISOString();
  const retryAfterSeconds = Math.max(
    0,
    Math.ceil((retryAfterTime - Date.now()) / 1000),
  );
  const storedContext = parseCloudflareRateLimitContext(
    await getRuntimeStateValue(env, CLOUDFLARE_RATE_LIMIT_CONTEXT_KEY),
  );

  return {
    retryAfter,
    retryAfterSeconds,
    rateLimitContext: storedContext
      ? {
          ...storedContext,
          retryAfter,
          retryAfterSeconds,
        }
      : null,
  };
};

const rememberCloudflareRateLimit = async (
  env: WorkerEnv,
  response: Response,
  requestContext: CloudflareRequestContext,
): Promise<CloudflareRateLimitState> => {
  const retryAfterSeconds = resolveRetryAfterSeconds(
    response.headers.get("retry-after"),
  );
  const retryAfter = resolveRetryAfterIso(retryAfterSeconds);
  const rateLimitContext: CloudflareRateLimitContext = {
    ...requestContext,
    triggeredAt: nowIso(),
    retryAfter,
    retryAfterSeconds,
    lastBlockedAt: null,
    lastBlockedBy: null,
  };

  await setRuntimeStateValue(
    env,
    CLOUDFLARE_RATE_LIMITED_UNTIL_KEY,
    retryAfter,
  );
  await setRuntimeStateValue(
    env,
    CLOUDFLARE_RATE_LIMIT_CONTEXT_KEY,
    JSON.stringify(rateLimitContext),
  );

  logOperationalEvent("warn", "cloudflare.rate_limit.upstream", {
    projectOperation: requestContext.projectOperation,
    projectRoute: requestContext.projectRoute,
    cloudflareMethod: requestContext.cloudflareMethod,
    cloudflarePath: requestContext.cloudflarePath,
    retryAfter,
    retryAfterSeconds,
    responseHeaders: pickHeaders(response.headers, [
      "retry-after",
      "cf-ray",
      "ratelimit",
      "ratelimit-policy",
    ]),
  });

  return {
    retryAfter,
    retryAfterSeconds,
    rateLimitContext,
  };
};

const rememberCloudflareLocalBlock = async (
  env: WorkerEnv,
  state: CloudflareRateLimitState,
  requestSource: CloudflareRequestSource,
): Promise<CloudflareRateLimitState> => {
  if (!state.rateLimitContext) {
    return state;
  }

  const nextContext: CloudflareRateLimitContext = {
    ...state.rateLimitContext,
    lastBlockedAt: nowIso(),
    lastBlockedBy: {
      projectOperation: requestSource.projectOperation,
      projectRoute: requestSource.projectRoute,
    },
  };

  await setRuntimeStateValue(
    env,
    CLOUDFLARE_RATE_LIMIT_CONTEXT_KEY,
    JSON.stringify(nextContext),
  );

  logOperationalEvent("warn", "cloudflare.rate_limit.local_block", {
    triggeredBy: {
      projectOperation: nextContext.projectOperation,
      projectRoute: nextContext.projectRoute,
      cloudflareMethod: nextContext.cloudflareMethod,
      cloudflarePath: nextContext.cloudflarePath,
    },
    blockedRequest: requestSource,
    retryAfter: state.retryAfter,
    retryAfterSeconds: state.retryAfterSeconds,
  });

  return {
    ...state,
    rateLimitContext: nextContext,
  };
};

const ensureCloudflareRequestAllowed = async (
  env: WorkerEnv,
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  const state = await getCloudflareRateLimitState(env);
  if (!state) return;
  throw createCloudflareRateLimitError(
    await rememberCloudflareLocalBlock(env, state, requestSource),
  );
};

const cfRequest = async <T>(
  env: WorkerEnv,
  config: RuntimeConfig,
  path: string,
  requestContext: CloudflareRequestContext,
  init?: RequestInit,
  options?: {
    ignoreStatuses?: number[];
    ignoreWhen?: (context: {
      response: Response;
      data: CloudflareEnvelope<T> | null;
    }) => boolean;
    onRequestAttempted?: () => void;
    skipRateLimitCheck?: boolean;
  },
) => {
  if (!options?.skipRateLimitCheck) {
    await ensureCloudflareRequestAllowed(env, requestContext);
  }

  options?.onRequestAttempted?.();
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
      await rememberCloudflareRateLimit(env, response, requestContext),
    );
  }

  if (!response.ok || !data?.success) {
    logOperationalEvent("error", "cloudflare.request.failed", {
      projectOperation: requestContext.projectOperation,
      projectRoute: requestContext.projectRoute,
      cloudflareMethod: requestContext.cloudflareMethod,
      cloudflarePath: requestContext.cloudflarePath,
      responseStatus: response.status || 502,
      responseHeaders: pickHeaders(response.headers, ["cf-ray"]),
      errors: data?.errors ?? null,
    });
    throw new ApiError(
      response.status || 502,
      data?.errors?.[0]?.message ?? "Cloudflare API request failed",
    );
  }

  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") {
    logOperationalEvent("info", "cloudflare.request.succeeded", {
      projectOperation: requestContext.projectOperation,
      projectRoute: requestContext.projectRoute,
      cloudflareMethod: requestContext.cloudflareMethod,
      cloudflarePath: requestContext.cloudflarePath,
      responseStatus: response.status,
      responseHeaders: pickHeaders(response.headers, ["cf-ray"]),
    });
  }

  return data.result;
};

export const listZones = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  if (!ensureManagementEnabled(config)) return [];
  const result = await cfRequest<CloudflareZoneResult[]>(
    env,
    config,
    "/zones?per_page=100",
    buildCloudflareRequestContext(requestSource, "GET", "/zones?per_page=100"),
  );
  return (result ?? []).map(toZoneSummary);
};

export const createZone = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  rootDomain: string,
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  requireDomainLifecycleManagement(config, "binding");
  const result = await cfRequest<CloudflareZoneResult>(
    env,
    config,
    "/zones",
    buildCloudflareRequestContext(requestSource, "POST", "/zones"),
    {
      method: "POST",
      body: JSON.stringify({
        account: { id: requireAccountId(config) },
        name: rootDomain,
        type: "full",
      }),
    },
  );
  if (!result) {
    throw new ApiError(502, "Cloudflare API request failed");
  }
  return toZoneSummary(result);
};

export const deleteZone = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  requestSourceOrOptions?:
    | CloudflareRequestSource
    | {
        bypassRateLimitCheck?: boolean;
      },
  options?: {
    bypassRateLimitCheck?: boolean;
  },
) => {
  requireDomainLifecycleManagement(config, "deletion");
  const zoneId = requireZoneId(domain);
  const requestSource =
    requestSourceOrOptions &&
    "projectOperation" in requestSourceOrOptions &&
    "projectRoute" in requestSourceOrOptions
      ? requestSourceOrOptions
      : defaultCloudflareRequestSource;
  const resolvedOptions =
    requestSourceOrOptions &&
    "projectOperation" in requestSourceOrOptions &&
    "projectRoute" in requestSourceOrOptions
      ? options
      : requestSourceOrOptions;
  const result = await cfRequest<CloudflareZoneResult>(
    env,
    config,
    `/zones/${zoneId}`,
    buildCloudflareRequestContext(requestSource, "DELETE", `/zones/${zoneId}`),
    { method: "DELETE" },
    {
      ignoreStatuses: [404],
      skipRateLimitCheck: resolvedOptions?.bypassRateLimitCheck ?? false,
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
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
  options?: CloudflareRequestExecutionOptions,
) => {
  if (!ensureManagementEnabled(config)) return;
  const fqdn = `${subdomain}.${domain.rootDomain}`;
  const zoneId = requireZoneId(domain);
  await cfRequest(
    env,
    config,
    `/zones/${zoneId}/email/routing/dns`,
    buildCloudflareRequestContext(
      requestSource,
      "POST",
      `/zones/${zoneId}/email/routing/dns`,
    ),
    {
      method: "POST",
      body: JSON.stringify({ name: fqdn }),
    },
    {
      onRequestAttempted: options?.onRequestAttempted,
    },
  );
};

export const deleteSubdomainEmailRoutingDnsRecords = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  subdomain: string,
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
  options?: DeleteSubdomainEmailRoutingDnsRecordsOptions,
): Promise<DeleteSubdomainEmailRoutingDnsRecordsResult> => {
  if (!ensureManagementEnabled(config)) {
    return { matchedRecordCount: 0, requestCount: 0, completed: true };
  }

  const zoneId = requireZoneId(domain);
  const fqdn = `${subdomain}.${domain.rootDomain}`;
  const encodedName = encodeURIComponent(fqdn);
  const listPath = `/zones/${zoneId}/dns_records?per_page=100&name=${encodedName}`;
  let requestCount = 0;

  try {
    const records =
      (await cfRequest<CloudflareDnsRecordResult[]>(
        env,
        config,
        listPath,
        buildCloudflareRequestContext(requestSource, "GET", listPath),
        undefined,
        {
          onRequestAttempted: () => {
            requestCount += 1;
          },
        },
      )) ?? [];

    const candidateRecords = records.filter((record) =>
      isEmailRoutingDnsRecord(record, fqdn),
    );

    for (const record of candidateRecords) {
      if (
        options?.requestBudget !== undefined &&
        requestCount >= options.requestBudget
      ) {
        return {
          matchedRecordCount: candidateRecords.length,
          requestCount,
          completed: false,
        };
      }

      const deletePath = `/zones/${zoneId}/dns_records/${record.id}`;
      await cfRequest(
        env,
        config,
        deletePath,
        buildCloudflareRequestContext(requestSource, "DELETE", deletePath),
        {
          method: "DELETE",
        },
        {
          ignoreWhen: ({ response, data }) =>
            response.status === 404 &&
            hasOnlyMissingDnsRecordErrors(data?.errors),
          onRequestAttempted: () => {
            requestCount += 1;
          },
        },
      );
    }

    return {
      matchedRecordCount: candidateRecords.length,
      requestCount,
      completed: true,
    };
  } catch (error) {
    throw withCloudflareRequestCount(error, requestCount);
  }
};

export const createRoutingRule = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  address: string,
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  if (!ensureManagementEnabled(config)) return null;
  const workerName = requireEmailWorkerName(config);
  const zoneId = requireZoneId(domain);
  const result = await cfRequest<{ id: string }>(
    env,
    config,
    `/zones/${zoneId}/email/routing/rules`,
    buildCloudflareRequestContext(
      requestSource,
      "POST",
      `/zones/${zoneId}/email/routing/rules`,
    ),
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
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  if (!ensureManagementEnabled(config)) return null;
  const zoneId = requireZoneId(domain);
  const result = await cfRequest<CloudflareCatchAllRuleResult>(
    env,
    config,
    `/zones/${zoneId}/email/routing/rules/catch_all`,
    buildCloudflareRequestContext(
      requestSource,
      "GET",
      `/zones/${zoneId}/email/routing/rules/catch_all`,
    ),
  );
  return toCatchAllRule(result);
};

export const updateCatchAllRule = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  rule: CloudflareCatchAllRule,
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(
    env,
    config,
    `/zones/${zoneId}/email/routing/rules/catch_all`,
    buildCloudflareRequestContext(
      requestSource,
      "PUT",
      `/zones/${zoneId}/email/routing/rules/catch_all`,
    ),
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
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(
    env,
    config,
    `/zones/${zoneId}/email/routing/rules/${ruleId}`,
    buildCloudflareRequestContext(
      requestSource,
      "DELETE",
      `/zones/${zoneId}/email/routing/rules/${ruleId}`,
    ),
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
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest<{ id: string }>(
    env,
    config,
    `/zones/${zoneId}`,
    buildCloudflareRequestContext(requestSource, "GET", `/zones/${zoneId}`),
  );
};

export const enableDomainRouting = async (
  env: WorkerEnv,
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  requestSource: CloudflareRequestSource = defaultCloudflareRequestSource,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(
    env,
    config,
    `/zones/${zoneId}/email/routing/enable`,
    buildCloudflareRequestContext(
      requestSource,
      "POST",
      `/zones/${zoneId}/email/routing/enable`,
    ),
    {
      method: "POST",
    },
  );
};
