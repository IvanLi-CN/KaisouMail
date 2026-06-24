import { zValidator } from "@hono/zod-validator";
import {
  adminTransferApiKeyReauthRequestSchema,
  adminTransferPasskeyReauthRequestSchema,
  adminTransferVerificationResponseSchema,
  createAdminTransferIntentResponseSchema,
  createInviteRequestSchema,
  createInviteResponseSchema,
  listInvitesResponseSchema,
  paginationQuerySchema,
  registrationSettingsResponseSchema,
  transferAdminRequestSchema,
  updateRegistrationSettingsRequestSchema,
} from "@kaisoumail/shared";
import { Hono } from "hono";
import { z } from "zod";

import { apiValidationHook } from "../lib/validation";
import {
  issueSessionCookie,
  requireAuth,
  serializeSessionCookie,
} from "../services/auth";
import {
  createAdminTransferIntent,
  createInvite,
  deleteInvite,
  getRegistrationSettings,
  listInvitesPaginated,
  transferAdminRole,
  updateRegistrationSettings,
  verifyAdminTransferReauthSubject,
  verifyAdminTransferWithApiKey,
} from "../services/identity";
import {
  createPasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
} from "../services/passkeys";
import type { AppBindings } from "../types";

const adminTransferPasskeyVerificationRequestSchema = z.object({
  intentToken: z.string().min(1),
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

export const adminRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ admin: true, sessionOnly: true }))
  .get(
    "/invites",
    zValidator("query", paginationQuerySchema, apiValidationHook),
    async (c) =>
      c.json(
        listInvitesResponseSchema.parse(
          await listInvitesPaginated(c.env, c.req.valid("query")),
        ),
      ),
  )
  .post(
    "/invites",
    zValidator("json", createInviteRequestSchema, apiValidationHook),
    async (c) => {
      const actor = c.get("authUser");
      const body = c.req.valid("json");
      const invites = await createInvite(c.env, actor, {
        note: body.note,
        count: body.count,
      });
      return c.json(createInviteResponseSchema.parse({ invites }), 201);
    },
  )
  .delete("/invites/:id", async (c) => {
    await deleteInvite(c.env, c.req.param("id"));
    return c.body(null, 204);
  })
  .get("/registration-settings", async (c) =>
    c.json(
      registrationSettingsResponseSchema.parse({
        settings: await getRegistrationSettings(c.env, c.get("runtimeConfig")),
      }),
    ),
  )
  .put(
    "/registration-settings",
    zValidator(
      "json",
      updateRegistrationSettingsRequestSchema,
      apiValidationHook,
    ),
    async (c) =>
      c.json(
        registrationSettingsResponseSchema.parse({
          settings: await updateRegistrationSettings(
            c.env,
            c.req.valid("json"),
          ),
        }),
      ),
  )
  .post("/users/:id/transfer-admin/intent", async (c) => {
    const actor = c.get("authUser");
    const intentToken = await createAdminTransferIntent(
      c.env,
      c.get("runtimeConfig"),
      actor.id,
      c.req.param("id"),
    );
    return c.json(
      createAdminTransferIntentResponseSchema.parse({
        intentToken,
      }),
    );
  })
  .post(
    "/users/:id/transfer-admin/verify/api-key",
    zValidator(
      "json",
      adminTransferApiKeyReauthRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const actor = c.get("authUser");
      const result = await verifyAdminTransferWithApiKey(
        c.env,
        c.get("runtimeConfig"),
        actor.id,
        c.req.valid("json"),
      );
      if (result.targetUserId !== c.req.param("id")) {
        throw new Error("Admin transfer target mismatch");
      }
      return c.json(
        adminTransferVerificationResponseSchema.parse({
          verificationToken: result.verificationToken,
          method: "api-key",
        }),
      );
    },
  )
  .post(
    "/users/:id/transfer-admin/verify/passkey",
    zValidator(
      "json",
      adminTransferPasskeyVerificationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const actor = c.get("authUser");
      const body = c.req.valid("json");
      const config = c.get("runtimeConfig");
      const passkeyResult = await verifyPasskeyAuthentication(
        c.env,
        config,
        c.req.raw,
        body.response as never,
      );
      if (
        passkeyResult.adminTransferIntentToken &&
        passkeyResult.adminTransferIntentToken !== body.intentToken
      ) {
        throw new Error("Admin transfer intent mismatch");
      }
      const result = await verifyAdminTransferReauthSubject(
        c.env,
        config,
        actor.id,
        {
          intentToken: body.intentToken,
          method: "passkey",
          authenticatedUserId: passkeyResult.user.id,
        },
      );
      if (result.targetUserId !== c.req.param("id")) {
        throw new Error("Admin transfer target mismatch");
      }
      const token = await issueSessionCookie(config, passkeyResult.user);
      c.header("Set-Cookie", passkeyResult.clearCookie, { append: true });
      c.header(
        "Set-Cookie",
        serializeSessionCookie(token, config.APP_ENV === "production"),
        { append: true },
      );
      return c.json(
        adminTransferVerificationResponseSchema.parse({
          verificationToken: result.verificationToken,
          method: "passkey",
        }),
      );
    },
  )
  .post(
    "/users/:id/transfer-admin/verify/passkey/options",
    zValidator(
      "json",
      adminTransferPasskeyReauthRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const actor = c.get("authUser");
      const config = c.get("runtimeConfig");
      await createAdminTransferIntent(
        c.env,
        config,
        actor.id,
        c.req.param("id"),
      );
      const result = await createPasskeyAuthenticationOptions(
        config,
        c.req.raw,
        {
          adminTransferIntentToken: c.req.valid("json").intentToken,
        },
      );
      c.header("Set-Cookie", result.cookie);
      return c.json(result.options);
    },
  )
  .post(
    "/users/:id/transfer-admin",
    zValidator("json", transferAdminRequestSchema, apiValidationHook),
    async (c) => {
      const actor = c.get("authUser");
      await transferAdminRole(
        c.env,
        c.get("runtimeConfig"),
        actor.id,
        c.req.param("id"),
        c.req.valid("json").verificationToken,
      );
      return c.body(null, 204);
    },
  );
