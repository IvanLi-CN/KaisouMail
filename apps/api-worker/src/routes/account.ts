import { zValidator } from "@hono/zod-validator";
import {
  accountResponseSchema,
  listExternalAccountsResponseSchema,
  updateAccountRequestSchema,
} from "@kaisoumail/shared";
import { Hono } from "hono";

import { apiValidationHook } from "../lib/validation";
import { requireAuth, serializeExpiredSessionCookie } from "../services/auth";
import {
  getAccountForUser,
  listExternalAccountsForUser,
  releaseExternalAccount,
  softDeleteAccount,
  updateNickname,
} from "../services/identity";
import type { AppBindings } from "../types";

export const accountRoutes = new Hono<AppBindings>()
  .use("*", requireAuth({ sessionOnly: true }))
  .get("/", async (c) => {
    const user = c.get("authUser");
    const account = await getAccountForUser(c.env, user.id);
    return c.json(accountResponseSchema.parse({ user: account }));
  })
  .patch(
    "/",
    zValidator("json", updateAccountRequestSchema, apiValidationHook),
    async (c) => {
      const user = c.get("authUser");
      const account = await updateNickname(
        c.env,
        user.id,
        c.req.valid("json").nickname,
      );
      return c.json(accountResponseSchema.parse({ user: account }));
    },
  )
  .delete("/", async (c) => {
    const user = c.get("authUser");
    await softDeleteAccount(c.env, user);
    c.header(
      "Set-Cookie",
      serializeExpiredSessionCookie(
        c.get("runtimeConfig").APP_ENV === "production",
      ),
    );
    return c.body(null, 204);
  })
  .get("/external-accounts", async (c) => {
    const user = c.get("authUser");
    return c.json(
      listExternalAccountsResponseSchema.parse({
        externalAccounts: await listExternalAccountsForUser(c.env, user.id),
      }),
    );
  })
  .delete("/external-accounts/:id", async (c) => {
    const user = c.get("authUser");
    await releaseExternalAccount(c.env, user.id, c.req.param("id"));
    return c.body(null, 204);
  });
