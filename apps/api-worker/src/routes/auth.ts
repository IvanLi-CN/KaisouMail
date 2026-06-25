import { zValidator } from "@hono/zod-validator";
import {
  authProvidersResponseSchema,
  completeExternalRegistrationRequestSchema,
  completePasskeyRegistrationRequestSchema,
  createSessionRequestSchema,
  passkeyInviteRegistrationOptionsRequestSchema,
  pendingRegistrationQuerySchema,
  pendingRegistrationResponseSchema,
  sessionResponseSchema,
  startPasskeyRegistrationRequestSchema,
  startProviderRegistrationRequestSchema,
  startProviderRegistrationResponseSchema,
} from "@kaisoumail/shared";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { Hono } from "hono";
import { z } from "zod";

import { buildApiErrorPayload } from "../lib/errors";
import { apiValidationHook } from "../lib/validation";
import {
  authenticateApiKey,
  issueSessionCookie,
  requireAuth,
  resolveSessionUser,
  serializeExpiredSessionCookie,
  serializeSessionCookie,
} from "../services/auth";
import { buildAuthProviderStatuses } from "../services/identity";
import {
  buildProviderStartUrl,
  completePendingExternalRegistration,
  completeProviderCallback,
  resolvePendingRegistration,
} from "../services/oauth";
import {
  createPasskeyAuthenticationOptions,
  createPasskeyInviteRegistrationOptions,
  createPasskeyInviteRegistrationOptionsForCompletion,
  createPasskeyPendingRegistrationToken,
  verifyPasskeyAuthentication,
  verifyPasskeyInviteRegistration,
  verifyPasskeyRegistrationFromCompletion,
} from "../services/passkeys";
import type { AppBindings } from "../types";

const passkeyAuthenticationVerificationRequestSchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

const passkeyInviteVerificationRequestSchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

const providerStartQuerySchema = z.object({
  intent: z.enum(["login", "bind", "admin-transfer"]).default("login"),
  inviteCode: z.string().trim().optional(),
  returnTo: z.string().trim().optional(),
  intentToken: z.string().trim().optional(),
});

const providerRegistrationParamsSchema = z.object({
  provider: z.enum(["github", "linuxdo"]),
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
      const body = c.req.valid("json");
      const config = c.get("runtimeConfig");
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
  .get("/providers", async (c) =>
    c.json(
      authProvidersResponseSchema.parse({
        providers: await buildAuthProviderStatuses(
          c.env,
          c.get("runtimeConfig"),
        ),
      }),
    ),
  )
  .post(
    "/:provider/register/start",
    zValidator("param", providerRegistrationParamsSchema, apiValidationHook),
    zValidator(
      "json",
      startProviderRegistrationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");
      const url = await buildProviderStartUrl(
        c.get("runtimeConfig"),
        c.req.raw,
        c.env,
        params.provider,
        {
          intent: "register",
          inviteCode: body.inviteCode,
          returnTo: body.returnTo ?? "/register",
        },
      );
      return c.json(
        startProviderRegistrationResponseSchema.parse({
          startUrl: url,
        }),
      );
    },
  )
  .post(
    "/passkey/register/start",
    zValidator(
      "json",
      startPasskeyRegistrationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const token = await createPasskeyPendingRegistrationToken(
        c.get("runtimeConfig"),
        c.req.valid("json"),
      );
      return c.json(
        pendingRegistrationResponseSchema.parse({
          registration: {
            token,
            method: "passkey",
            sourceIntent: "register",
            redirectTo: "/workspace",
            inviteRequired: true,
            invitePrevalidated: Boolean(c.req.valid("json").inviteCode?.trim()),
            canComplete: true,
            suggestedNickname: null,
            error: null,
          },
        }),
      );
    },
  )
  .get(
    "/:provider/start",
    zValidator("query", providerStartQuerySchema, apiValidationHook),
    async (c) => {
      const query = c.req.valid("query");
      const sessionUser =
        query.intent === "bind" || query.intent === "admin-transfer"
          ? await resolveSessionUser(c.env, c.get("runtimeConfig"), c.req.raw)
          : null;
      const url = await buildProviderStartUrl(
        c.get("runtimeConfig"),
        c.req.raw,
        c.env,
        c.req.param("provider"),
        {
          intent: query.intent,
          inviteCode: query.inviteCode,
          returnTo: query.returnTo,
          currentUser: sessionUser,
          adminTransferIntentToken: query.intentToken,
        },
      );
      return c.redirect(url, 302);
    },
  )
  .get("/:provider/callback", async (c) => {
    const config = c.get("runtimeConfig");
    const result = await completeProviderCallback(
      c.env,
      config,
      c.req.raw,
      c.req.param("provider"),
      new URL(c.req.url).searchParams,
    );
    if (result.user) {
      const token = await issueSessionCookie(config, result.user);
      c.header(
        "Set-Cookie",
        serializeSessionCookie(token, config.APP_ENV === "production"),
      );
    }
    return c.redirect(result.redirectTo, 302);
  })
  .get(
    "/registration/pending",
    zValidator("query", pendingRegistrationQuerySchema, apiValidationHook),
    async (c) => {
      const registration = await resolvePendingRegistration(
        c.env,
        c.get("runtimeConfig"),
        c.req.valid("query").token,
      );
      return c.json(
        pendingRegistrationResponseSchema.parse({
          registration,
        }),
      );
    },
  )
  .post(
    "/registration/external/complete",
    zValidator(
      "json",
      completeExternalRegistrationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const config = c.get("runtimeConfig");
      const result = await completePendingExternalRegistration(
        c.env,
        config,
        c.req.valid("json"),
      );
      const token = await issueSessionCookie(config, result.user);
      c.header(
        "Set-Cookie",
        serializeSessionCookie(token, config.APP_ENV === "production"),
      );
      return c.json(
        sessionResponseSchema.parse({
          user: result.user,
          authenticatedAt: new Date().toISOString(),
        }),
        201,
      );
    },
  )
  .post(
    "/registration/passkey/options",
    zValidator(
      "json",
      completePasskeyRegistrationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const config = c.get("runtimeConfig");
      const pendingToken = await createPasskeyPendingRegistrationToken(
        config,
        c.req.valid("json"),
      );
      const result = await createPasskeyInviteRegistrationOptionsForCompletion(
        c.env,
        config,
        c.req.raw,
        {
          inviteCode: c.req.valid("json").inviteCode,
          nickname: c.req.valid("json").nickname,
          passkeyName: c.req.valid("json").passkeyName,
          pendingToken,
        },
      );
      c.header("Set-Cookie", result.cookie);
      return c.json(result.options);
    },
  )
  .post(
    "/registration/passkey/verify",
    zValidator(
      "json",
      passkeyInviteVerificationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const config = c.get("runtimeConfig");
      const result = await verifyPasskeyRegistrationFromCompletion(
        c.env,
        config,
        c.req.raw,
        c.req.valid("json").response as unknown as RegistrationResponseJSON,
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
        201,
      );
    },
  )
  .post("/passkey/options", async (c) => {
    const config = c.get("runtimeConfig");
    const result = await createPasskeyAuthenticationOptions(config, c.req.raw);
    c.header("Set-Cookie", result.cookie);
    return c.json(result.options);
  })
  .post(
    "/passkey/verify",
    zValidator(
      "json",
      passkeyAuthenticationVerificationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const config = c.get("runtimeConfig");
      const result = await verifyPasskeyAuthentication(
        c.env,
        config,
        c.req.raw,
        c.req.valid("json").response as unknown as AuthenticationResponseJSON,
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
  .post(
    "/passkey/register/options",
    zValidator(
      "json",
      passkeyInviteRegistrationOptionsRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const config = c.get("runtimeConfig");
      const result = await createPasskeyInviteRegistrationOptions(
        config,
        c.req.raw,
        c.req.valid("json"),
      );
      c.header("Set-Cookie", result.cookie);
      return c.json(result.options);
    },
  )
  .post(
    "/passkey/register/verify",
    zValidator(
      "json",
      passkeyInviteVerificationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const config = c.get("runtimeConfig");
      const result = await verifyPasskeyInviteRegistration(
        c.env,
        config,
        c.req.raw,
        c.req.valid("json").response as unknown as RegistrationResponseJSON,
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
        201,
      );
    },
  )
  .delete("/session", async (c) => {
    const config = c.get("runtimeConfig");
    c.header(
      "Set-Cookie",
      serializeExpiredSessionCookie(config.APP_ENV === "production"),
    );
    return c.body(null, 204);
  });
