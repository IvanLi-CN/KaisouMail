import {
  createApiKeyRequestSchema,
  createApiKeyResponseSchema,
  listApiKeysResponseSchema,
} from "@cf-mail/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { apiValidationHook } from "../lib/validation";
import {
  createApiKeyForUser,
  listApiKeysForUser,
  requireAuth,
  revokeApiKeyForUser,
} from "../services/auth";
import type { AppBindings } from "../types";

export const apiKeyRoutes = new Hono<AppBindings>()
  .use("*", requireAuth())
  .get("/", async (c) => {
    const user = c.get("authUser");
    return c.json(
      listApiKeysResponseSchema.parse({
        apiKeys: await listApiKeysForUser(c.env, user.id),
      }),
    );
  })
  .post(
    "/",
    zValidator("json", createApiKeyRequestSchema, apiValidationHook),
    async (c) => {
      const user = c.get("authUser");
      const body = c.req.valid("json");
      const result = await createApiKeyForUser(
        c.env,
        user.id,
        body.name,
        body.scopes,
      );
      return c.json(createApiKeyResponseSchema.parse(result), 201);
    },
  )
  .post("/:id/revoke", async (c) => {
    await revokeApiKeyForUser(c.env, c.get("authUser"), c.req.param("id"));
    return c.body(null, 204);
  });
