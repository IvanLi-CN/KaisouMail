import {
  createSessionRequestSchema,
  sessionResponseSchema,
} from "@cf-mail/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { parseRuntimeConfig } from "../env";
import {
  authenticateApiKey,
  issueSessionCookie,
  requireAuth,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from "../services/auth";
import type { AppBindings } from "../types";

export const authRoutes = new Hono<AppBindings>()
  .get("/session", requireAuth(), async (c) => {
    const user = c.get("authUser");
    return c.json(
      sessionResponseSchema.parse({
        user,
        authenticatedAt: new Date().toISOString(),
      }),
    );
  })
  .post(
    "/session",
    zValidator("json", createSessionRequestSchema),
    async (c) => {
      const config = parseRuntimeConfig(c.env);
      const body = c.req.valid("json");
      const user = await authenticateApiKey(c.env, config, body.apiKey);
      if (!user) return c.json({ error: "Invalid API key" }, 401);
      const token = await issueSessionCookie(config, user);
      c.header(
        "Set-Cookie",
        serializeSessionCookie(token, config.APP_ENV === "production"),
      );
      return c.json(
        sessionResponseSchema.parse({
          user,
          authenticatedAt: new Date().toISOString(),
        }),
      );
    },
  )
  .delete("/session", async (c) => {
    const config = parseRuntimeConfig(c.env);
    c.header(
      "Set-Cookie",
      serializeExpiredSessionCookie(config.APP_ENV === "production"),
    );
    return c.body(null, 204);
  });
