import { versionInfo, versionResponseSchema } from "@cf-mail/shared";
import { Hono } from "hono";

import { getDb } from "./db/client";
import { parseRuntimeConfig } from "./env";
import { applyCorsHeaders, resolveAllowedCorsOrigin } from "./lib/cors";
import { ApiError, buildApiErrorPayload } from "./lib/errors";
import { apiKeyRoutes } from "./routes/apiKeys";
import { authRoutes } from "./routes/auth";
import { domainRoutes } from "./routes/domains";
import { mailboxRoutes } from "./routes/mailboxes";
import { messageRoutes } from "./routes/messages";
import { metaRoutes } from "./routes/meta";
import { userRoutes } from "./routes/users";
import {
  ensureBootstrapAdmin,
  ensureBootstrapDomains,
} from "./services/bootstrap";
import type { AppBindings } from "./types";

export const createApp = () => {
  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    const runtimeConfig = parseRuntimeConfig(c.env);
    c.set("runtimeConfig", runtimeConfig);
    const db = getDb(c.env);
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
  app.route("/api/domains", domainRoutes);
  app.route("/api/meta", metaRoutes);
  app.route("/api/mailboxes", mailboxRoutes);
  app.route("/api/messages", messageRoutes);
  app.route("/api/users", userRoutes);
  app.get("/health", (c) => c.json({ ok: true }));

  app.onError((error, c) => {
    const runtimeConfig = c.get("runtimeConfig") ?? parseRuntimeConfig(c.env);
    const requestOrigin = c.req.header("origin") ?? undefined;
    const allowHeaders =
      c.req.header("Access-Control-Request-Headers") ??
      "Content-Type, Authorization";
    const allowedOrigin = resolveAllowedCorsOrigin(
      requestOrigin,
      runtimeConfig,
    );

    if (error instanceof ApiError) {
      const headers = new Headers({
        "content-type": "application/json",
      });
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
    console.error(error);
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
  });

  return app;
};
