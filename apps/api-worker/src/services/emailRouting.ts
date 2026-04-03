import type { RuntimeConfig } from "../env";
import { ApiError } from "../lib/errors";

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: Array<{ message: string }>;
  result: T;
}

export interface EmailRoutingDomain {
  rootDomain: string;
  zoneId: string | null;
}

const ensureManagementEnabled = (config: RuntimeConfig) => {
  if (!config.EMAIL_ROUTING_MANAGEMENT_ENABLED) return false;
  if (!config.CLOUDFLARE_API_TOKEN) {
    throw new ApiError(
      500,
      "Email Routing management is enabled but CLOUDFLARE_API_TOKEN is not configured",
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

const requireEmailWorkerName = (config: RuntimeConfig) => {
  if (config.EMAIL_WORKER_NAME) return config.EMAIL_WORKER_NAME;
  throw new ApiError(
    500,
    "Email Routing management is enabled but EMAIL_WORKER_NAME is not configured",
  );
};

const cfRequest = async <T>(
  config: RuntimeConfig,
  path: string,
  init?: RequestInit,
) => {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.CLOUDFLARE_API_TOKEN}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json()) as CloudflareEnvelope<T>;
  if (!response.ok || !data.success) {
    throw new ApiError(
      response.status || 502,
      data.errors?.[0]?.message ?? "Cloudflare API request failed",
    );
  }
  return data.result;
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
  return result.id;
};

export const deleteRoutingRule = async (
  config: RuntimeConfig,
  domain: EmailRoutingDomain,
  ruleId: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  const zoneId = requireZoneId(domain);
  await cfRequest(config, `/zones/${zoneId}/email/routing/rules/${ruleId}`, {
    method: "DELETE",
  });
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
