import { z } from "zod";

export const REQUIRED_RUNTIME_SECRETS = ["SESSION_SECRET"] as const;

const runtimeConfigSchema = z.object({
  APP_ENV: z.string().default("development"),
  MAIL_DOMAIN: z.string().min(1).optional(),
  EMAIL_WORKER_NAME: z.string().min(1).optional(),
  DEFAULT_MAILBOX_TTL_MINUTES: z.coerce.number().int().min(5).default(60),
  CLEANUP_BATCH_SIZE: z.coerce.number().int().min(1).max(20).default(3),
  EMAIL_ROUTING_MANAGEMENT_ENABLED: z.coerce.boolean().default(false),
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
});

export interface WorkerEnv {
  DB: D1Database;
  MAIL_BUCKET: R2Bucket;
  APP_ENV: string;
  MAIL_DOMAIN?: string;
  EMAIL_WORKER_NAME?: string;
  DEFAULT_MAILBOX_TTL_MINUTES: string;
  CLEANUP_BATCH_SIZE: string;
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
}

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export type RuntimeConfigParseResult =
  | { success: true; config: RuntimeConfig }
  | { success: false; issues: z.ZodIssue[] };

const normalizeRuntimeConfig = (
  config: z.infer<typeof runtimeConfigSchema>,
): RuntimeConfig => {
  return {
    ...config,
    // Prefer the explicit runtime token, but keep the shared token as a
    // quickstart-compatible fallback.
    CLOUDFLARE_API_TOKEN:
      config.CLOUDFLARE_RUNTIME_API_TOKEN ?? config.CLOUDFLARE_API_TOKEN,
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
  env: Pick<WorkerEnv, "WEB_APP_ORIGIN">,
) => {
  if (!env.WEB_APP_ORIGIN) {
    return undefined;
  }

  try {
    return new URL(env.WEB_APP_ORIGIN).origin;
  } catch {
    return undefined;
  }
};
