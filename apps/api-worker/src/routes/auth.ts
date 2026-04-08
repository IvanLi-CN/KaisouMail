import { zValidator } from "@hono/zod-validator";
import {
  createSessionRequestSchema,
  sessionResponseSchema,
} from "@kaisoumail/shared";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { Hono } from "hono";
import { z } from "zod";

import { parseRuntimeConfig } from "../env";
import { buildApiErrorPayload } from "../lib/errors";
import { apiValidationHook } from "../lib/validation";
import {
  authenticateApiKey,
  issueSessionCookie,
  requireAuth,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from "../services/auth";
import {
  createPasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
} from "../services/passkeys";
import type { AppBindings } from "../types";

const passkeyVerificationRequestSchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

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
    zValidator("json", createSessionRequestSchema, apiValidationHook),
    async (c) => {
      const config = parseRuntimeConfig(c.env);
      const body = c.req.valid("json");
      const user = await authenticateApiKey(c.env, config, body.apiKey);
      if (!user) {
        return c.json(buildApiErrorPayload("Invalid API key", null), 401);
      }
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
  .post("/passkey/options", async (c) => {
    const config = parseRuntimeConfig(c.env);
    const result = await createPasskeyAuthenticationOptions(config, c.req.raw);
    c.header("Set-Cookie", result.cookie);
    return c.json(result.options);
  })
  .post(
    "/passkey/verify",
    zValidator("json", passkeyVerificationRequestSchema, apiValidationHook),
    async (c) => {
      const config = parseRuntimeConfig(c.env);
      const body = c.req.valid("json");
      const result = await verifyPasskeyAuthentication(
        c.env,
        config,
        c.req.raw,
        body.response as unknown as AuthenticationResponseJSON,
      );
      const token = await issueSessionCookie(config, result.user);
      c.header("Set-Cookie", result.clearCookie, { append: true });
      c.header(
        "Set-Cookie",
        serializeSessionCookie(token, config.APP_ENV === "production"),
        { append: true },
      );
      return c.json(
        sessionResponseSchema.parse({
          user: result.user,
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
