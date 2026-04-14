import { ApiClientError } from "@/lib/api";
import { hasDelegationPendingProvisionError } from "@/lib/domain-catalog";
import type { PublicDocsLinks } from "@/lib/public-docs";

export type DomainBindErrorHint = {
  title: string;
  docsHref?: string | null;
  rawMessage: string;
};

const serializeDetails = (value: unknown) => {
  if (value == null) return "";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const toRawMessage = (error: unknown) => {
  if (error instanceof ApiClientError) {
    const details = serializeDetails(error.details).trim();
    return details ? `${error.message}\n${details}` : error.message;
  }

  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "绑定域名失败";
};

const normalizeForMatch = (error: unknown) => toRawMessage(error).toLowerCase();

const formatRetryAfterHint = (error: unknown) => {
  if (!(error instanceof ApiClientError) || !error.retryAfterSeconds) {
    return null;
  }

  if (error.retryAfterSeconds < 60) {
    return `${error.retryAfterSeconds} 秒后再试`;
  }

  return `${Math.ceil(error.retryAfterSeconds / 60)} 分钟后再试`;
};

const withAnchor = (href: string | undefined, anchor: string) =>
  href ? `${href}#${anchor}` : null;

export const classifyDomainBindError = (
  error: unknown,
  docsLinks?: PublicDocsLinks | null,
): DomainBindErrorHint => {
  const retryAfterHint = formatRetryAfterHint(error);
  const rawMessage = [
    toRawMessage(error).trim() || "绑定域名失败",
    retryAfterHint,
  ]
    .filter(Boolean)
    .join("\n");
  const normalized = normalizeForMatch(error);

  if (
    (error instanceof ApiClientError && error.status === 429) ||
    (normalized.includes("rate limit") && normalized.includes("cloudflare"))
  ) {
    return {
      title: "Cloudflare API 暂时限流",
      docsHref: null,
      rawMessage,
    };
  }

  if (normalized.includes("com.cloudflare.api.account.zone.create")) {
    return {
      title: "缺少 zone.create 权限",
      docsHref: withAnchor(
        docsLinks?.projectDomainBinding,
        "missing-zone-create-permission",
      ),
      rawMessage,
    };
  }

  if (normalized.includes("mailbox domain already exists")) {
    return {
      title: "这个域名已经在项目里",
      docsHref: withAnchor(
        docsLinks?.domainCatalogEnablement,
        "zone-already-exists-in-project",
      ),
      rawMessage,
    };
  }

  if (normalized.includes("already exists") && normalized.includes("zone")) {
    return {
      title: "Cloudflare 里已存在这个域名",
      docsHref: withAnchor(
        docsLinks?.domainCatalogEnablement,
        "bind-domain-in-cloudflare",
      ),
      rawMessage,
    };
  }

  if (normalized.includes("cloudflare_account_id")) {
    return {
      title: "缺少 CLOUDFLARE_ACCOUNT_ID",
      docsHref: withAnchor(
        docsLinks?.projectDomainBinding,
        "missing-cloudflare-account-id",
      ),
      rawMessage,
    };
  }

  if (hasDelegationPendingProvisionError(normalized)) {
    return {
      title: "zone 尚未激活",
      docsHref: withAnchor(
        docsLinks?.projectDomainBinding,
        "zone-pending-or-nameserver-not-delegated",
      ),
      rawMessage,
    };
  }

  if (
    (normalized.includes("email routing management is enabled but") &&
      normalized.includes("not configured")) ||
    normalized.includes("email_worker_name") ||
    normalized.includes("cloudflare_runtime_api_token") ||
    (normalized.includes("cloudflare_api_token") &&
      normalized.includes("not configured"))
  ) {
    return {
      title: "缺少 Email Routing 运行时配置",
      docsHref: withAnchor(
        docsLinks?.projectDomainBinding,
        "email-routing-runtime-config-missing",
      ),
      rawMessage,
    };
  }

  if (
    (normalized.includes("authentication error") ||
      normalized.includes("forbidden") ||
      normalized.includes("unauthorized") ||
      normalized.includes("permission denied") ||
      normalized.includes("cannot manage routes") ||
      normalized.includes("cannot manage zone settings")) &&
    (normalized.includes("email routing") ||
      normalized.includes("routing") ||
      normalized.includes("zone settings"))
  ) {
    return {
      title: "缺少 Email Routing 写权限",
      docsHref: withAnchor(
        docsLinks?.projectDomainBinding,
        "email-routing-auth-or-permission-failure",
      ),
      rawMessage,
    };
  }

  if (
    normalized.includes("requires permission") ||
    normalized.includes("permission denied") ||
    normalized.includes("forbidden") ||
    normalized.includes("unauthorized")
  ) {
    return {
      title: "缺少 Cloudflare 绑定权限",
      docsHref: withAnchor(
        docsLinks?.projectDomainBinding,
        "missing-zone-binding-permission",
      ),
      rawMessage,
    };
  }

  return {
    title: "Cloudflare 绑定失败",
    docsHref: null,
    rawMessage,
  };
};
