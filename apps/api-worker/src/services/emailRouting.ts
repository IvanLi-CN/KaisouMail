import type { RuntimeConfig } from "../env";
import { ApiError } from "../lib/errors";

interface CloudflareEnvelope<T> {
  success: boolean;
  errors: Array<{ message: string }>;
  result: T;
}

const ensureManagementEnabled = (config: RuntimeConfig) => {
  if (!config.EMAIL_ROUTING_MANAGEMENT_ENABLED) return false;
  if (!config.CLOUDFLARE_ZONE_ID || !config.CLOUDFLARE_API_TOKEN) {
    throw new ApiError(
      500,
      "Email Routing management is enabled but Cloudflare credentials are incomplete",
    );
  }
  return true;
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
  subdomain: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  const fqdn = `${subdomain}.${config.MAIL_DOMAIN}`;
  await cfRequest(
    config,
    `/zones/${config.CLOUDFLARE_ZONE_ID}/email/routing/dns`,
    {
      method: "POST",
      body: JSON.stringify({ name: fqdn }),
    },
  );
};

export const createRoutingRule = async (
  config: RuntimeConfig,
  address: string,
) => {
  if (!ensureManagementEnabled(config)) return null;
  const result = await cfRequest<{ id: string }>(
    config,
    `/zones/${config.CLOUDFLARE_ZONE_ID}/email/routing/rules`,
    {
      method: "POST",
      body: JSON.stringify({
        name: `Mailbox ${address}`,
        enabled: true,
        matchers: [{ field: "to", type: "literal", value: address }],
        actions: [{ type: "worker" }],
      }),
    },
  );
  return result.id;
};

export const deleteRoutingRule = async (
  config: RuntimeConfig,
  ruleId: string,
) => {
  if (!ensureManagementEnabled(config)) return;
  await cfRequest(
    config,
    `/zones/${config.CLOUDFLARE_ZONE_ID}/email/routing/rules/${ruleId}`,
    {
      method: "DELETE",
    },
  );
};
