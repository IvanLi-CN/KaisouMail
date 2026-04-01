import { versionInfo, versionResponseSchema } from "@cf-mail/shared";
import { Hono } from "hono";

import { getDb } from "./db/client";
import { parseRuntimeConfig } from "./env";
import { ApiError } from "./lib/errors";
import { apiKeyRoutes } from "./routes/apiKeys";
import { authRoutes } from "./routes/auth";
import { mailboxRoutes } from "./routes/mailboxes";
import { messageRoutes } from "./routes/messages";
import { userRoutes } from "./routes/users";
import { ensureBootstrapAdmin } from "./services/bootstrap";
import type { AppBindings } from "./types";

export const createApp = () => {
  const app = new Hono<AppBindings>();

  app.use("*", async (c, next) => {
    const runtimeConfig = parseRuntimeConfig(c.env);
    c.set("runtimeConfig", runtimeConfig);
    await ensureBootstrapAdmin(getDb(c.env), runtimeConfig);
    await next();
  });

  app.get("/api/version", (c) =>
    c.json(versionResponseSchema.parse(versionInfo)),
  );
  app.route("/api/auth", authRoutes);
  app.route("/api/api-keys", apiKeyRoutes);
  app.route("/api/mailboxes", mailboxRoutes);
  app.route("/api/messages", messageRoutes);
  app.route("/api/users", userRoutes);
  app.get("/health", (c) => c.json({ ok: true }));

  app.onError((error, _c) => {
    if (error instanceof ApiError) {
      return new Response(
        JSON.stringify({
          error: error.message,
          details: error.details ?? null,
        }),
        {
          status: error.status,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }
    console.error(error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: {
        "content-type": "application/json",
      },
    });
  });

  return app;
};
