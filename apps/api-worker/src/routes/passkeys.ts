import { zValidator } from "@hono/zod-validator";
import {
  createPasskeyRequestSchema,
  listPasskeysResponseSchema,
  passkeySchema,
} from "@kaisoumail/shared";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { Hono } from "hono";
import { z } from "zod";

import { apiValidationHook } from "../lib/validation";
import { requireAuth } from "../services/auth";
import {
  createPasskeyRegistrationOptionsForUser,
  listPasskeysForUser,
  revokePasskeyForUser,
  verifyPasskeyRegistrationForUser,
} from "../services/passkeys";
import type { AppBindings } from "../types";

const passkeyRegistrationVerificationRequestSchema = z.object({
  response: z.object({ id: z.string().min(1) }).passthrough(),
});

export const passkeyRoutes = new Hono<AppBindings>()
  .use("*", requireAuth())
  .get("/", async (c) => {
    return c.json(
      listPasskeysResponseSchema.parse({
        passkeys: await listPasskeysForUser(c.env, c.get("authUser").id),
      }),
    );
  })
  .post(
    "/registration/options",
    zValidator("json", createPasskeyRequestSchema, apiValidationHook),
    async (c) => {
      const result = await createPasskeyRegistrationOptionsForUser(
        c.env,
        c.get("runtimeConfig"),
        c.req.raw,
        c.get("authUser"),
        c.req.valid("json").name.trim(),
      );
      c.header("Set-Cookie", result.cookie);
      return c.json(result.options);
    },
  )
  .post(
    "/registration/verify",
    zValidator(
      "json",
      passkeyRegistrationVerificationRequestSchema,
      apiValidationHook,
    ),
    async (c) => {
      const result = await verifyPasskeyRegistrationForUser(
        c.env,
        c.get("runtimeConfig"),
        c.req.raw,
        c.get("authUser"),
        c.req.valid("json").response as unknown as RegistrationResponseJSON,
      );
      c.header("Set-Cookie", result.clearCookie);
      return c.json(passkeySchema.parse(result.passkey), 201);
    },
  )
  .delete("/:id", async (c) => {
    await revokePasskeyForUser(c.env, c.get("authUser"), c.req.param("id"));
    return c.body(null, 204);
  });
