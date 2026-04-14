import { versionInfo, versionResponseSchema } from "@kaisoumail/shared";
import { Hono } from "hono";
import type { ZodIssue } from "zod";

import { getDb } from "./db/client";
import { safeParseRuntimeConfig } from "./env";
import {
  applyCorsHeaders,
  resolveAllowedCorsOrigin,
  resolveAllowedCorsOriginFromEnv,
} from "./lib/cors";
import { randomId } from "./lib/crypto";
import { ApiError, buildApiErrorPayload } from "./lib/errors";
import { logOperationalEvent } from "./lib/observability";
import { apiKeyRoutes } from "./routes/apiKeys";
import { authRoutes } from "./routes/auth";
import { domainRoutes } from "./routes/domains";
import { mailboxRoutes } from "./routes/mailboxes";
import { messageRoutes } from "./routes/messages";
import { metaRoutes } from "./routes/meta";
import { passkeyRoutes } from "./routes/passkeys";
import { userRoutes } from "./routes/users";
import {
  ensureBootstrapAdmin,
  ensureBootstrapDomains,
} from "./services/bootstrap";
import type { AppBindings } from "./types";

const resolveFallbackCorsOrigin = (
  requestOrigin: string | undefined,
  env: AppBindings["Bindings"],
) => resolveAllowedCorsOriginFromEnv(requestOrigin, env);

const buildInternalErrorResponse = (
  allowHeaders: string,
  allowedOrigin: string | null,
) => {
  const headers = new Headers({
    "content-type": "application/json",
  });
  applyCorsHeaders(headers, allowedOrigin, allowHeaders);

  return new Response(
    JSON.stringify(buildApiErrorPayload("Internal server error", null)),
    {
      status: 500,
      headers,
    },
  );
};

const logRuntimeConfigIssues = (issues: ZodIssue[]) => {
  logOperationalEvent("error", "runtime.config.invalid", {
    issues: issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
    })),
  });
};

export const createApp = () => {
  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    const requestId =
      c.req.header("x-request-id") ?? c.req.header("cf-ray") ?? randomId("req");
    c.set("requestId", requestId);
    await next();
    c.res.headers.set("x-request-id", requestId);
  });

  app.use("*", async (c, next) => {
    const runtimeConfigResult = safeParseRuntimeConfig(c.env);
    if (!runtimeConfigResult.success) {
      logRuntimeConfigIssues(runtimeConfigResult.issues);
      const requestOrigin = c.req.header("origin") ?? undefined;
      const allowHeaders =
        c.req.header("Access-Control-Request-Headers") ??
        "Content-Type, Authorization";
      const allowedOrigin = resolveFallbackCorsOrigin(requestOrigin, c.env);

      if (c.req.method === "OPTIONS" && c.req.path.startsWith("/api/")) {
        const headers = new Headers();
        applyCorsHeaders(headers, allowedOrigin, allowHeaders);
        return new Response(null, {
          status: allowedOrigin ? 204 : 403,
          headers,
        });
      }

      return buildInternalErrorResponse(allowHeaders, allowedOrigin);
    }

    c.set("runtimeConfig", runtimeConfigResult.config);
    await next();
  });

  app.use("*", async (c, next) => {
    if (c.req.path === "/health" || c.req.path === "/api/version") {
      await next();
      return;
    }

    const db = getDb(c.env);
    const runtimeConfig = c.get("runtimeConfig");
    await ensureBootstrapAdmin(db, runtimeConfig);
    await ensureBootstrapDomains(db, runtimeConfig);
    await next();
  });

  app.use("/api/*", async (c, next) => {
    const runtimeConfig = c.get("runtimeConfig");
    const requestOrigin = c.req.header("origin") ?? undefined;
    const allowHeaders =
      c.req.header("Access-Control-Request-Headers") ??
      "Content-Type, Authorization";
    const allowedOrigin = resolveAllowedCorsOrigin(
      requestOrigin,
      runtimeConfig,
    );

    if (c.req.method === "OPTIONS") {
      const headers = new Headers();
      applyCorsHeaders(headers, allowedOrigin, allowHeaders);
      return new Response(null, {
        status: allowedOrigin ? 204 : 403,
        headers,
      });
    }

    await next();
    applyCorsHeaders(c.res.headers, allowedOrigin, allowHeaders);
  });

  app.get("/api/version", (c) =>
    c.json(versionResponseSchema.parse(versionInfo)),
  );
  app.route("/api/auth", authRoutes);
  app.route("/api/api-keys", apiKeyRoutes);
  app.route("/api/passkeys", passkeyRoutes);
  app.route("/api/domains", domainRoutes);
  app.route("/api/meta", metaRoutes);
  app.route("/api/mailboxes", mailboxRoutes);
  app.route("/api/messages", messageRoutes);
  app.route("/api/users", userRoutes);
  app.get("/health", async (c) => {
    await c.env.DB.prepare("select 1").first();
    return c.json({ ok: true });
  });

  app.onError((error, c) => {
    const requestId = c.get("requestId");
    const runtimeConfig = c.get("runtimeConfig");
    const requestOrigin = c.req.header("origin") ?? undefined;
    const allowHeaders =
      c.req.header("Access-Control-Request-Headers") ??
      "Content-Type, Authorization";
    const allowedOrigin = runtimeConfig
      ? resolveAllowedCorsOrigin(requestOrigin, runtimeConfig)
      : resolveFallbackCorsOrigin(requestOrigin, c.env);

    if (error instanceof ApiError) {
      logOperationalEvent(
        error.status >= 500 ? "error" : error.status >= 429 ? "warn" : "info",
        "api.request.failed",
        {
          requestId,
          method: c.req.method,
          path: c.req.path,
          status: error.status,
          error: error.message,
          details: error.details ?? null,
        },
      );
      const headers = new Headers(error.headers ?? undefined);
      headers.set("content-type", "application/json");
      headers.set("x-request-id", requestId);
      applyCorsHeaders(headers, allowedOrigin, allowHeaders);
      return new Response(
        JSON.stringify(
          buildApiErrorPayload(error.message, error.details ?? null),
        ),
        {
          status: error.status,
          headers,
        },
      );
    }
    logOperationalEvent("error", "api.request.crash", {
      requestId,
      method: c.req.method,
      path: c.req.path,
      error,
    });
    const response = buildInternalErrorResponse(allowHeaders, allowedOrigin);
    response.headers.set("x-request-id", requestId);
    return response;
  });

  return app;
};
