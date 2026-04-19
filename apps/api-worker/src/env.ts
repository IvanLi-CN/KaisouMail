import { maxMailboxTtlMinutes, minMailboxTtlMinutes } from "@kaisoumail/shared";
import { z } from "zod";

export const REQUIRED_RUNTIME_SECRETS = ["SESSION_SECRET"] as const;
export const DEFAULT_WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const envBooleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}, z.boolean());

const runtimeConfigSchema = z.object({
  APP_ENV: z.string().default("development"),
  MAIL_DOMAIN: z.string().min(1).optional(),
  EMAIL_WORKER_NAME: z.string().min(1).optional(),
  DEFAULT_MAILBOX_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(minMailboxTtlMinutes)
    .max(maxMailboxTtlMinutes)
    .default(60),
  CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(3),
  SUBDOMAIN_CLEANUP_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(0)
    .max(500)
    .default(200),
  // Cloudflare REST API currently allows 1,200 requests / 5 minutes / token.
  // Keep one scheduled cleanup pass well below that ceiling while still
  // draining backlog within hours instead of days.
  SUBDOMAIN_CLEANUP_REQUEST_BUDGET: z.coerce
    .number()
    .int()
    .min(1)
    .max(1000)
    .default(400),
  EMAIL_ROUTING_MANAGEMENT_ENABLED: envBooleanSchema.default(false),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_ZONE_ID: z.string().optional(),
  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_RUNTIME_API_TOKEN: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_NAME: z.string().default("Owner"),
  BOOTSTRAP_ADMIN_API_KEY: z.string().min(16).optional(),
  SESSION_SECRET: z.string().min(16),
  CF_ROUTE_RULESET_TAG: z.string().default("kaisoumail"),
  WEB_APP_ORIGIN: z.string().url().optional(),
  WEB_APP_ORIGINS: z.string().optional(),
  WORKERS_AI_MODEL: z.string().min(1).default(DEFAULT_WORKERS_AI_MODEL),
});

export interface WorkerEnv {
  AI?: Ai;
  DB: D1Database;
  MAIL_BUCKET: R2Bucket;
  APP_ENV: string;
  MAIL_DOMAIN?: string;
  EMAIL_WORKER_NAME?: string;
  DEFAULT_MAILBOX_TTL_MINUTES: string;
  CLEANUP_BATCH_SIZE: string;
  SUBDOMAIN_CLEANUP_BATCH_SIZE: string;
  SUBDOMAIN_CLEANUP_REQUEST_BUDGET: string;
  EMAIL_ROUTING_MANAGEMENT_ENABLED: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_RUNTIME_API_TOKEN?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_NAME?: string;
  BOOTSTRAP_ADMIN_API_KEY?: string;
  SESSION_SECRET: string;
  CF_ROUTE_RULESET_TAG?: string;
  WEB_APP_ORIGIN?: string;
  WEB_APP_ORIGINS?: string;
  WORKERS_AI_MODEL?: string;
}

export interface RuntimeConfig
  extends Omit<
    z.output<typeof runtimeConfigSchema>,
    "WEB_APP_ORIGIN" | "WEB_APP_ORIGINS" | "WORKERS_AI_MODEL"
  > {
  WEB_APP_ORIGIN?: string;
  WEB_APP_ORIGINS?: string[];
  WORKERS_AI_MODEL?: string;
}

export type RuntimeConfigParseResult =
  | { success: true; config: RuntimeConfig }
  | { success: false; issues: z.ZodIssue[] };

const toWebAppOrigin = (value: string | undefined) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return undefined;
  }

  try {
    return new URL(trimmedValue).origin;
  } catch {
    return undefined;
  }
};

const parseConfiguredWebAppOrigins = (value: string | undefined) => {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((origin) => toWebAppOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
};

export const resolveConfiguredWebAppOrigins = (
  env: Pick<WorkerEnv, "WEB_APP_ORIGIN" | "WEB_APP_ORIGINS">,
) => {
  const origins = new Set<string>();
  const primaryOrigin = toWebAppOrigin(env.WEB_APP_ORIGIN);

  if (primaryOrigin) {
    origins.add(primaryOrigin);
  }

  for (const origin of parseConfiguredWebAppOrigins(env.WEB_APP_ORIGINS)) {
    origins.add(origin);
  }

  return [...origins];
};

const normalizeRuntimeConfig = (
  config: z.output<typeof runtimeConfigSchema>,
): RuntimeConfig => {
  const webAppOrigins = resolveConfiguredWebAppOrigins({
    WEB_APP_ORIGIN: config.WEB_APP_ORIGIN,
    WEB_APP_ORIGINS: config.WEB_APP_ORIGINS,
  });

  return {
    ...config,
    // Prefer the explicit runtime token, but keep the shared token as a
    // quickstart-compatible fallback.
    CLOUDFLARE_API_TOKEN:
      config.CLOUDFLARE_RUNTIME_API_TOKEN ?? config.CLOUDFLARE_API_TOKEN,
    WEB_APP_ORIGIN: webAppOrigins[0],
    WEB_APP_ORIGINS: webAppOrigins,
  };
};

export const safeParseRuntimeConfig = (
  env: WorkerEnv,
): RuntimeConfigParseResult => {
  const result = runtimeConfigSchema.safeParse(env);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues,
    };
  }

  return {
    success: true,
    config: normalizeRuntimeConfig(result.data),
  };
};

export const parseRuntimeConfig = (env: WorkerEnv): RuntimeConfig => {
  const result = safeParseRuntimeConfig(env);
  if (!result.success) {
    throw new z.ZodError(result.issues);
  }

  return result.config;
};

export const resolveConfiguredWebAppOrigin = (
  env: Pick<WorkerEnv, "WEB_APP_ORIGIN" | "WEB_APP_ORIGINS">,
) => resolveConfiguredWebAppOrigins(env)[0];
