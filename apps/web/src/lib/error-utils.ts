import { ApiClientError } from "@/lib/api";
import { formatCloudflareRateLimitDetails } from "@/lib/cloudflare-rate-limit";

const NOT_FOUND_PATTERN = /\bnot found\b|不存在|未找到|找不到/i;
const PERMISSION_PATTERN =
  /\bforbidden\b|\bunauthorized\b|authentication required|permission denied|权限|无权/i;

const serializeDetails = (value: unknown) => {
  if (value == null) return null;
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const getErrorMessage = (
  error: unknown,
  fallback = "请求失败，请稍后重试。",
) => {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

export const getErrorDetails = (error: unknown) => {
  if (error instanceof ApiClientError) {
    const cloudflareDetails = formatCloudflareRateLimitDetails(error.details);
    return cloudflareDetails ?? serializeDetails(error.details);
  }
  if (error instanceof Error) return error.stack ?? error.message;
  return serializeDetails(error);
};

export const isNotFoundError = (error: unknown) => {
  if (error instanceof ApiClientError && error.status === 404) return true;
  return NOT_FOUND_PATTERN.test(getErrorMessage(error, ""));
};

export const isPermissionError = (error: unknown) => {
  if (
    error instanceof ApiClientError &&
    (error.status === 401 || error.status === 403)
  ) {
    return true;
  }

  return PERMISSION_PATTERN.test(getErrorMessage(error, ""));
};
