import type { RuntimeConfig, WorkerEnv } from "../env";
import { resolveConfiguredWebAppOrigin } from "../env";

const localOriginRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const trimTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const resolveAllowedCorsOrigin = (
  origin: string | undefined,
  config: RuntimeConfig,
) => {
  if (!origin) return null;

  const normalizedOrigin = trimTrailingSlash(origin);
  const allowedOrigins = new Set<string>();

  if (config.WEB_APP_ORIGIN) {
    allowedOrigins.add(trimTrailingSlash(config.WEB_APP_ORIGIN));
  }

  if (
    config.APP_ENV !== "production" &&
    localOriginRegex.test(normalizedOrigin)
  ) {
    allowedOrigins.add(normalizedOrigin);
  }

  return allowedOrigins.has(normalizedOrigin) ? normalizedOrigin : null;
};

export const resolveAllowedCorsOriginFromEnv = (
  origin: string | undefined,
  env: Pick<WorkerEnv, "APP_ENV" | "WEB_APP_ORIGIN">,
) => {
  if (!origin) return null;

  const normalizedOrigin = trimTrailingSlash(origin);
  const allowedOrigins = new Set<string>();
  const configuredOrigin = resolveConfiguredWebAppOrigin(env);

  if (configuredOrigin) {
    allowedOrigins.add(trimTrailingSlash(configuredOrigin));
  }

  if (env.APP_ENV !== "production" && localOriginRegex.test(normalizedOrigin)) {
    allowedOrigins.add(normalizedOrigin);
  }

  return allowedOrigins.has(normalizedOrigin) ? normalizedOrigin : null;
};

export const applyCorsHeaders = (
  headers: Headers,
  origin: string | null,
  allowHeaders: string,
) => {
  if (!origin) return;
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", allowHeaders);
  headers.append("Vary", "Origin");
};
