const DEFAULT_RETRY_AFTER_SECONDS = 15 * 60;

const parseRetryAfterSeconds = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const timestamp = Date.parse(trimmed);
  if (Number.isNaN(timestamp)) return null;

  const seconds = Math.ceil((timestamp - Date.now()) / 1000);
  return seconds >= 0 ? seconds : 0;
};

export const resolveRetryAfterSeconds = (
  value: string | null | undefined,
  fallbackSeconds = DEFAULT_RETRY_AFTER_SECONDS,
) => parseRetryAfterSeconds(value) ?? fallbackSeconds;

export const resolveRetryAfterIso = (
  retryAfterSeconds: number,
  baseTime = Date.now(),
) => new Date(baseTime + retryAfterSeconds * 1000).toISOString();

export const buildRateLimitErrorDetails = (input: {
  retryAfterSeconds: number;
  retryAfter: string;
  source: "cloudflare" | "workers_ai";
  extras?: Record<string, unknown>;
}) => ({
  source: input.source,
  retryAfter: input.retryAfter,
  retryAfterSeconds: input.retryAfterSeconds,
  ...(input.extras ?? {}),
});
