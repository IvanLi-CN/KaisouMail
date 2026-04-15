import type {
  CloudflareRateLimitContext,
  CloudflareSync,
} from "@/lib/contracts";

const projectOperationLabels: Record<string, string> = {
  "domains.catalog": "刷新域名目录",
  "domains.create": "启用 Cloudflare 域名",
  "domains.bind": "直绑新域名",
  "domains.retry": "重试域名接入",
  "domains.catch_all.enable": "开启域名 Catch-all",
  "domains.catch_all.disable": "关闭域名 Catch-all",
  "domains.delete": "删除项目直绑域名",
  "mailboxes.create": "创建邮箱",
  "mailboxes.ensure": "确保邮箱存在",
  "mailboxes.destroy": "删除邮箱",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCloudflareRateLimitContext = (
  value: unknown,
): value is CloudflareRateLimitContext =>
  isRecord(value) &&
  typeof value.triggeredAt === "string" &&
  typeof value.projectOperation === "string" &&
  typeof value.projectRoute === "string" &&
  typeof value.cloudflareMethod === "string" &&
  typeof value.cloudflarePath === "string" &&
  (value.lastBlockedAt === null || typeof value.lastBlockedAt === "string") &&
  (value.lastBlockedBy === null ||
    (isRecord(value.lastBlockedBy) &&
      typeof value.lastBlockedBy.projectOperation === "string" &&
      typeof value.lastBlockedBy.projectRoute === "string"));

export const getCloudflareRateLimitContext = (
  value: unknown,
): CloudflareRateLimitContext | null => {
  if (isCloudflareRateLimitContext(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  return isCloudflareRateLimitContext(value.rateLimitContext)
    ? value.rateLimitContext
    : null;
};

export const getCloudflareRateLimitOperationLabel = (
  projectOperation: string,
) => projectOperationLabels[projectOperation] ?? projectOperation;

export const describeCloudflareRateLimitContext = (
  context: CloudflareRateLimitContext | null | undefined,
) => {
  if (!context) {
    return null;
  }

  return `${getCloudflareRateLimitOperationLabel(context.projectOperation)}（${context.projectRoute}）先触发了 Cloudflare ${context.cloudflareMethod} ${context.cloudflarePath}`;
};

export const getCloudflareRateLimitBannerCopy = (
  cloudflareSync: CloudflareSync | null | undefined,
) => {
  const context = getCloudflareRateLimitContext(cloudflareSync);
  if (!context) {
    return null;
  }

  return `最近一次冷却来自 ${describeCloudflareRateLimitContext(context)}。`;
};

export const formatCloudflareRateLimitDetails = (details: unknown) => {
  if (!isRecord(details) || details.source !== "cloudflare") {
    return null;
  }

  const context = getCloudflareRateLimitContext(details);
  if (!context) {
    return null;
  }

  const lines = [
    `触发来源：${getCloudflareRateLimitOperationLabel(context.projectOperation)}（${context.projectRoute}）`,
    `Cloudflare 上游：${context.cloudflareMethod} ${context.cloudflarePath}`,
  ];

  if (typeof details.retryAfter === "string") {
    lines.push(`冷却截止：${details.retryAfter}`);
  }

  if (context.lastBlockedBy) {
    lines.push(
      `最近一次被本地冷却拦截：${getCloudflareRateLimitOperationLabel(context.lastBlockedBy.projectOperation)}（${context.lastBlockedBy.projectRoute}）`,
    );
  }

  return lines.join("\n");
};
