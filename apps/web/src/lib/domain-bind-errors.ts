import { ApiClientError } from "@/lib/api";
import { formatCloudflareRateLimitDetails } from "@/lib/cloudflare-rate-limit";
import { hasDelegationPendingProvisionError } from "@/lib/domain-catalog";
import { recommendApexMailboxBinding } from "@/lib/domain-classification";
import type { PublicDocsLinks } from "@/lib/public-docs";

export type DomainBindErrorHint = {
  title: string;
  docsHref?: string | null;
  rawMessage: string;
};

type DomainBindStructuredDetails = {
  code?: string;
  mailDomain?: string;
  recommendedApex?: string;
  recommendedMailboxSubdomain?: string;
  zoneId?: string;
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
    const details = (
      formatCloudflareRateLimitDetails(error.details) ??
      serializeDetails(error.details)
    ).trim();
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

const getStructuredDetails = (
  error: unknown,
): DomainBindStructuredDetails | null => {
  if (!(error instanceof ApiClientError)) return null;
  if (!error.details || typeof error.details !== "object") return null;
  return error.details as DomainBindStructuredDetails;
};

export const buildSubdomainDirectBindHint = (
  details: {
    mailDomain: string;
    recommendedApex: string;
    recommendedMailboxSubdomain: string;
  },
  docsLinks?: PublicDocsLinks | null,
): DomainBindErrorHint => ({
  title: "当前 Cloudflare 账号不支持直接绑定子域",
  docsHref: withAnchor(docsLinks?.projectDomainBinding, "bind-apex-only"),
  rawMessage: `请改为绑定 ${details.recommendedApex}，再在创建邮箱时把子域填成 ${details.recommendedMailboxSubdomain}，即可继续使用 user@${details.mailDomain} 这类地址。`,
});

export const buildExistingCatalogSubdomainHint = (
  details: {
    mailDomain: string;
  },
  docsLinks?: PublicDocsLinks | null,
): DomainBindErrorHint => ({
  title: "这个子域 zone 已经在 Cloudflare 里",
  docsHref: withAnchor(
    docsLinks?.domainCatalogEnablement,
    "enable-zone-in-project",
  ),
  rawMessage: `请回到域名目录，找到 ${details.mailDomain} 后点击“启用域名”；这条已有 zone 不需要再改走 apex 直绑。`,
});

export const classifyDomainBindError = (
  error: unknown,
  docsLinks?: PublicDocsLinks | null,
  mailDomain?: string,
): DomainBindErrorHint => {
  const retryAfterHint = formatRetryAfterHint(error);
  const rawMessage = [
    toRawMessage(error).trim() || "绑定域名失败",
    retryAfterHint,
  ]
    .filter(Boolean)
    .join("\n");
  const normalized = normalizeForMatch(error);
  const structuredDetails = getStructuredDetails(error);

  if (
    structuredDetails?.code === "subdomain_zone_available_in_catalog" &&
    structuredDetails.mailDomain
  ) {
    return buildExistingCatalogSubdomainHint(
      {
        mailDomain: structuredDetails.mailDomain,
      },
      docsLinks,
    );
  }

  if (
    normalized.includes("already available in cloudflare") &&
    mailDomain &&
    recommendApexMailboxBinding(mailDomain)
  ) {
    return buildExistingCatalogSubdomainHint(
      {
        mailDomain,
      },
      docsLinks,
    );
  }

  if (
    structuredDetails?.code === "subdomain_direct_bind_not_supported" &&
    structuredDetails.mailDomain &&
    structuredDetails.recommendedApex &&
    structuredDetails.recommendedMailboxSubdomain
  ) {
    return buildSubdomainDirectBindHint(
      {
        mailDomain: structuredDetails.mailDomain,
        recommendedApex: structuredDetails.recommendedApex,
        recommendedMailboxSubdomain:
          structuredDetails.recommendedMailboxSubdomain,
      },
      docsLinks,
    );
  }

  if (
    (normalized.includes("root domain") &&
      normalized.includes("not any subdomains")) ||
    normalized.includes("provide the root domain and not any subdomains")
  ) {
    const recommendation = mailDomain
      ? recommendApexMailboxBinding(mailDomain)
      : null;

    if (recommendation) {
      return buildSubdomainDirectBindHint(recommendation, docsLinks);
    }

    return {
      title: "当前 Cloudflare 账号不支持直接绑定子域",
      docsHref: withAnchor(docsLinks?.projectDomainBinding, "bind-apex-only"),
      rawMessage,
    };
  }

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
